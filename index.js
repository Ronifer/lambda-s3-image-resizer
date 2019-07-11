// dependencies
var async = require("async");
var AWS = require("aws-sdk");
var path = require("path");
var gm = require("gm").subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require("util");

// constants
var THUMB_WIDTH = 500;
var THUMB_HEIGHT = 440;

var validImageFormats = ["jpg", "jpeg", "png", "gif", "eps"];

// get reference to S3 client
var s3 = new AWS.S3();

exports.handler = function(event, context, callback) {
  // Read options from the event.
  console.log(
    "Reading options from event:\n",
    util.inspect(event, { depth: 5 })
  );
  var srcBucket = event.Records[0].s3.bucket.name;
  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  //   var dstBucket = srcBucket + "-resized";
  var dstBucket = srcBucket;
  var fileName = path.basename(srcKey);

  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    callback("Could not determine the image type.");
    return;
  }
  var imageType = typeMatch[1].toLowerCase();
  if (validImageFormats.indexOf(imageType) === -1) {
    callback("Unsupported image type: ${imageType}");
    return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  async.waterfall(
    [
      function download(next) {
        console.log("STEP 1", "downloading image");
        // Download the image from S3 into a buffer.
        s3.getObject(
          {
            Bucket: srcBucket,
            Key: srcKey
          },
          next
        );
      },
      function reduceQuality(response, next) {
        console.log("STEP 2", "reduce quality image");
        // drop image quality 50% and converto to jpg
        gm(response.Body)
          .antialias(true)
          .density(72)
          .quality(50)
          .toBuffer("jpg", function(err, buffer) {
            if (err) {
              console.log("line 76", err);
              next(err); // call the main callback in case of error
            } else {
              var position = fileName.lastIndexOf(".");
              var key = "lower/" + fileName.slice(0, position) + ".jpg";
              // Stream the transformed image to a different S3 bucket.
              s3.putObject(
                {
                  Bucket: dstBucket,
                  Key: key,
                  Body: buffer,
                  ContentType: "image/jpeg"
                },
                function(err) {
                  console.log(err);
                  console.log("image uploaded");
                  next(null, response);
                }
              );
            }
          });
      },
      function createThumbnail(response, next) {
        console.log("STEP 3", "create thumbnail");
        // drop image quality 50% and resize to be a thumb default size
        gm(response.Body)
          .antialias(true)
          .density(72)
          .quality(50)
          .resize(THUMB_WIDTH, THUMB_HEIGHT)
          .toBuffer("jpg", function(err, buffer) {
            if (err) {
              console.log("line 76", err);
              next(err); // call the main callback in case of error
            } else {
              var position = fileName.lastIndexOf(".");
              var key = "thumb/" + fileName.slice(0, position) + ".jpg";
              console.log("upload thumb image");
              // Stream the transformed image to a different S3 bucket.
              s3.putObject(
                {
                  Bucket: dstBucket,
                  Key: key,
                  Body: buffer,
                  ContentType: "image/jpeg"
                },
                function(err) {
                  console.log(err);
                  console.log("image uploaded");
                  next;
                }
              );
            }
          });
      }
    ],
    function(err) {
      if (err) {
        console.error("STACK ERROR");
      } else {
        console.log("STACK SUCCESS");
      }

      callback(null, "message");
    }
  );
};
