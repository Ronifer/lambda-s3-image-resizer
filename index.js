// dependencies
var async = require("async");
var AWS = require("aws-sdk");
var path = require("path");
var gm = require("gm").subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require("util");

// constants
var MAX_WIDTH = 100;
var MAX_HEIGHT = 100;

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
  var dstKey = "resized-" + srcKey;
  var fileName = path.basename(srcKey);
  var srcPath = path.dirname(srcKey) + "/";

  // Sanity check: validate that source and destination are different buckets.
  //   if (srcBucket == dstBucket) {
  //     callback("Source and destination buckets are the same.");
  //     return;
  //   }

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
      function convert(response, next) {
        console.log("converting image");
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
              console.log("STEP 3", "upload transformed image");
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
      },
      //   function transform(response, next) {
      //     gm(response.Body).size(function(err, size) {
      //       // Infer the scaling factor to avoid stretching the image unnaturally.
      //       var scalingFactor = Math.min(
      //         MAX_WIDTH / size.width,
      //         MAX_HEIGHT / size.height
      //       );
      //       var width = scalingFactor * size.width;
      //       var height = scalingFactor * size.height;

      //       // Transform the image buffer in memory.
      //       this.resize(width, height).toBuffer(imageType, function(err, buffer) {
      //         if (err) {
      //           next(err);
      //         } else {
      //           next(null, response.ContentType, buffer);
      //         }
      //       });
      //     });
      //   },
    //   function upload(bufferedImage, next) {}
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
