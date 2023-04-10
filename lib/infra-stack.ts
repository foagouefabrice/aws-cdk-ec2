import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    // Create vpc with 2 subnets
    const vpc = new ec2.Vpc(this, 'demovpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      vpcName:'demovpc',
      subnetConfiguration: [
        {
        cidrMask: 24,
        name: "demosubnet",
        subnetType: ec2.SubnetType.PUBLIC,
        }
      ]
    }) 
    // Allow SSH (TCP Port 22) and HTTP port 80 access 
    const securityGroup = new ec2.SecurityGroup(this, 'demoSG', {
      vpc,
      description: 'Allow SSH and http(TCP port 22and 80) in',
      allowAllOutbound: true
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP Access')
  
    const role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    // Use Latest Amazon Linux Image - CPU Type ARM64
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64
    });

    // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ami,
      securityGroup: securityGroup,
      //keyName: key.keyPairName,
      role: role
      
    });

    // Create an asset that will be used as part of User Data to run on first load
    const asset = new Asset(this, 'Asset', { path: path.join(__dirname, '../../service/config.sh') });
    const localPath = ec2Instance.userData.addS3DownloadCommand({
      bucket: asset.bucket,
      bucketKey: asset.s3ObjectKey,
    });

    ec2Instance.userData.addExecuteFileCommand({
      filePath: localPath,
      arguments: '--verbose -y'
    });
    asset.grantRead(ec2Instance.role);

    // Create outputs for connecting
    new cdk.CfnOutput(this, 'IP Address', { value: ec2Instance.instancePublicIp });
    // new cdk.CfnOutput(this, 'Key Name', { value: key.keyPairName })
    new cdk.CfnOutput(this, 'Download Key Command', { value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > infra/cdk-key.pem && chmod 400 infra/cdk-key.pem' })
    new cdk.CfnOutput(this, 'ssh command', { value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + ec2Instance.instancePublicIp })
  
  }
}

