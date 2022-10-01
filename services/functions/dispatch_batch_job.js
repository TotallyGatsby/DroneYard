// I have no idea why eslint is complaining about this import...
// eslint-disable-next-line import/no-extraneous-dependencies
import log from 'npmlog';

/* eslint-disable import/prefer-default-export */
export const handler = async (event) => {
  log.info('Execution', `Beginning dispatch_batch_job execution. ${JSON.stringify(event)}`);

  // Get the S3 path(s) -- multiple possible records can come in one invocation
  const jobPaths = [];

  event.Records.forEach((record) => {
    // extract the bucket / key
    const key = record.s3.object.key.replace(/\/dispatch$/, '');

    jobPaths.push({
      name: record.s3.bucket.name,
      key,
    });

    log.info('Execution', `Found new prefix ${record.s3.bucket.name}, ${key}`);
  });

  // Create an AWS batch job to process each path
  jobPaths.forEach((path) => {
    log.info('Execution', `Sending batch job for ${JSON.stringify(path)}`);
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `Beginning the dispatch of a batch job at ${event}.`,
  };
};
