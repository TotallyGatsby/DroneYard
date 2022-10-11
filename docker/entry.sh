#!/bin/bash

#set -e

# Copyright 2021-2022 Howard Butler <howard@hobu.co>
# with contributions from Michael D. Smith <https://github.com/msmitherdc>

# The following code is a derivative work of the code from the codm project,
# which is licensed GPLv3. This code therefore is also licensed under the terms
# of the GNU Public License, verison 3.

echo "Launching DroneYard"

BUCKET="$4"
KEY="$5"
OUTPUT="$6"

echo "processing images from '$KEY' in bucket $BUCKET to $OUTPUT"

cd /code

mkdir /local/images
ln -s /local/images /code/images

aws s3 sync s3://$BUCKET/$KEY/ /local/images --no-progress

aws s3 cp s3://$BUCKET/settings.yaml .

# try using an overriden settings file
aws s3 cp s3://$BUCKET/$KEY/settings.yaml .  || true

# try copying a boundary
aws s3 cp s3://$BUCKET/$KEY/boundary.json .  || true

BOUNDARY="--auto-boundary"
if test -f "boundary.json"; then
    BOUNDARY="--boundary boundary.json"
fi

#python3 /code/run.py --rerun-all --project-path ..
python3 /code/run.py --rerun-all $BOUNDARY --project-path .. 2>&1 | tee odm_$KEY-process.log

ls -al

# copy ODM products
PRODUCTS=$(ls -d odm_* 3d_tile*)
for val in $PRODUCTS;
do
    aws s3 sync $val s3://$BUCKET/$KEY/$OUTPUT/$val --no-progress
done

# copy the log
aws s3 cp odm_$KEY-process.log s3://$BUCKET/$KEY/$OUTPUT/odm_$KEY-process.log

# try to copy the EPT data (it isn't named odm_*)
aws s3 sync entwine_pointcloud s3://$BUCKET/$KEY/$OUTPUT/entwine_pointcloud --no-progress  || exit 0
