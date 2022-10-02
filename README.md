# DroneYard - OpenDroneMap Serverless Automation

DroneYard makes running OpenDroneMap automatically as simple as uploading your images and downloading
the results. DroneYard is a set of automated tooling built on top of AWS Batch that monitors
an S3 bucket for changes, and when it detects the presence of a trigger file, it will launch a
batch job to process your images.

It is heavily inspired by https://github.com/hobuinc/codm, which is a similar project with a
different set of dependencies.

This project deviates from codm by using SST rather than Serverless, and using Javscript as the
language of choice throughout the project.

The goal is to make setup and deployment as simple as possible, and rely only on an AWS account and
NPM.
