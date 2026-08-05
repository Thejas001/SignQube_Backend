const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "ap-south-1";
const bucketName = process.env.AWS_BUCKET_NAME || "sign-qube-test-v1";

console.log("Initializing S3 Client with region:", region);
console.log("Target Bucket:", bucketName);

if (!accessKeyId || !secretAccessKey) {
  console.error("Missing AWS credentials in environment variables.");
  process.exit(1);
}

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function runTest() {
  const testFileName = `test-upload-${Date.now()}.txt`;
  const fileContent = "This is a test document uploaded to verify SignQube AWS S3 bucket configuration. Successful upload!";
  
  console.log(`Attempting to upload file: ${testFileName} ...`);
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: `test-docs/${testFileName}`,
      Body: fileContent,
      ContentType: "text/plain",
    });
    
    const response = await s3Client.send(command);
    console.log("Upload Success! Response details:", response);
    const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/test-docs/${testFileName}`;
    console.log("File S3 URL:", fileUrl);
  } catch (error) {
    console.error("Upload failed with error:", error);
  }
}

runTest();
