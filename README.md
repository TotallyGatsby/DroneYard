# DroneYard - OpenDroneMap Serverless Automation

DroneYard makes running OpenDroneMap automatically as simple as uploading your images and downloading
the results. DroneYard is a set of automated tooling built on top of AWS Batch that monitors
an S3 bucket for changes, and when it detects the presence of a trigger file, it will launch a
batch job to process your images.

It is borrows inspiration and some code from https://github.com/hobuinc/codm, but makes different
choices about dependencies. In particular, everything is handled by the CDK so it can be built and deployed
with one single command.

The goal is to make setup and deployment as simple as possible, and rely only on AWS, Docker, and
NPM.

## Usage

### Prerequisites
DroneYard depends on AWS, NPM, and Docker.

### Configuration
Set your region in `sst.json` the default is **us-west-2**.

The stack can be configured in `awsconfig.json`, which is where you'll set instance types, whether
to use a GPU, and the target memory/CPU requirements.

### Deployment
```
npm install
npm run deploy -- --stage Prod
```

Everything is handled by the CDK. It will deploy an S3 bucket, a Lambda function, and an AWS Batch
environment (using the default VPC.) SST/CDK will handle the entire deployment including building
the docker container, uploading it to ECR, setting up all the permissions, and preparing all the
services.

You can use any stage name (`Prod` is used by convention, but any is fine.)

### Usage
After deploying, it will output a bucket name to the console, eg:

```
BucketName: dev-drone-yard-droneyard-dronephotosbucket1234567-1234567890
```

Create a folder in that bucket and upload all your photos into the bucket. `s3 sync` is useful for
this, but any client will work.

Once all your images are uploaded, upload an empty file named `dispatch` to the folder.

This will start the workflow. When the image processing is complete, a folder called `output` will
be alongside your photos.

### Removal
```
npm run remove -- --stage Prod
```

Note, I don't believe this will remove your S3 bucket if you have uploaded files to it! To avoid
charges for S3 you'll want to manually remove anything you uploaded.

### Dev (Local Development)
Because DroneYard is built on SST, you can start a local development server using:

```
npm run start
```

This will deploy two stacks -- one stack to manage forwarding Lambda function invocations to your
local workstation and one copy of the DroneYard stack. It will also launch a localhost URL that
provides a simplified UI for S3, Lambda, etc.

## Current Status
In active use to develop maps of forested land.

### Coming Soon
DroneYard supports uploading a `settings.yml` file into your S3 bucket, but doesn't provide a default
one, and doesn't provide any tools to manage it.

Adding support for notifications and canceling jobs is also an opportunity for future development.
