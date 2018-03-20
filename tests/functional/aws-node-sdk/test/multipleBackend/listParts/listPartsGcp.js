const assert = require('assert');

const withV4 = require('../../support/withV4');
const BucketUtility = require('../../../lib/utility/bucket-util');
const { describeSkipIfNotMultiple, gcpLocation }
    = require('../utils');

const bucket = 'buckettestmultiplebackendlistparts-gcp';
const firstPartSize = 10;
const bodyFirstPart = Buffer.alloc(firstPartSize);
const secondPartSize = 15;
const bodySecondPart = Buffer.alloc(secondPartSize);

let bucketUtil;
let s3;

describeSkipIfNotMultiple('List parts of MPU on GCP data backend', () => {
    withV4(sigCfg => {
        beforeEach(function beforeEachFn() {
            this.currentTest.key = `somekey-${Date.now()}`;
            bucketUtil = new BucketUtility('default', sigCfg);
            s3 = bucketUtil.s3;
            return s3.createBucketAsync({ Bucket: bucket })
            .then(() => s3.createMultipartUploadAsync({
                Bucket: bucket, Key: this.currentTest.key,
                Metadata: { 'scal-location-constraint': gcpLocation } }))
            .then(res => {
                this.currentTest.uploadId = res.UploadId;
                return s3.uploadPartAsync({ Bucket: bucket,
                    Key: this.currentTest.key, PartNumber: 1,
                    UploadId: this.currentTest.uploadId, Body: bodyFirstPart });
            }).then(res => {
                this.currentTest.firstEtag = res.ETag;
            }).then(() => s3.uploadPartAsync({ Bucket: bucket,
                Key: this.currentTest.key, PartNumber: 2,
                UploadId: this.currentTest.uploadId, Body: bodySecondPart })
            ).then(res => {
                this.currentTest.secondEtag = res.ETag;
            })
            .catch(err => {
                process.stdout.write(`Error in beforeEach: ${err}\n`);
                throw err;
            });
        });

        afterEach(function afterEachFn() {
            process.stdout.write('Emptying bucket');
            return s3.abortMultipartUploadAsync({
                Bucket: bucket, Key: this.currentTest.key,
                UploadId: this.currentTest.uploadId,
            })
            .then(() => bucketUtil.empty(bucket))
            .then(() => {
                process.stdout.write('Deleting bucket');
                return bucketUtil.deleteOne(bucket);
            })
            .catch(err => {
                process.stdout.write('Error in afterEach');
                throw err;
            });
        });

        it('should list both parts', function itFn(done) {
            s3.listParts({
                Bucket: bucket,
                Key: this.test.key,
                UploadId: this.test.uploadId },
            (err, data) => {
                assert.equal(err, null, `Err listing parts: ${err}`);
                assert.strictEqual(data.Parts.length, 2);
                assert.strictEqual(data.Parts[0].PartNumber, 1);
                assert.strictEqual(data.Parts[0].Size, firstPartSize);
                assert.strictEqual(data.Parts[0].ETag, this.test.firstEtag);
                assert.strictEqual(data.Parts[1].PartNumber, 2);
                assert.strictEqual(data.Parts[1].Size, secondPartSize);
                assert.strictEqual(data.Parts[1].ETag, this.test.secondEtag);
                done();
            });
        });

        it('should only list the second part', function itFn(done) {
            s3.listParts({
                Bucket: bucket,
                Key: this.test.key,
                PartNumberMarker: 1,
                UploadId: this.test.uploadId },
            (err, data) => {
                assert.equal(err, null, `Err listing parts: ${err}`);
                assert.strictEqual(data.Parts[0].PartNumber, 2);
                assert.strictEqual(data.Parts[0].Size, secondPartSize);
                assert.strictEqual(data.Parts[0].ETag, this.test.secondEtag);
                done();
            });
        });
    });
});
