const crypto = require("crypto");

async function runTest() {
  const PORT = process.env.PORT || 5000;
  const baseUrl = `http://localhost:${PORT}`;
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const testUser = {
    name: "S3 Tester",
    email: `s3tester-${randomSuffix}@signqube.com`,
    password: "Password123!",
  };

  console.log("1. Registering test user:", testUser.email);
  try {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testUser),
    });

    const regData = await regRes.json();
    if (!regRes.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    }

    console.log("User registered successfully!");
    const accessToken = regData.data.accessToken;

    console.log("2. Uploading a test document to S3 via API...");
    const formData = new FormData();
    
    // Create a mock document file using Blob
    const fileContent = "This is the content of the uploaded PDF test document verifying the S3 upload middleware and controller implementation.";
    const blob = new Blob([fileContent], { type: "application/pdf" });
    formData.append("document", blob, `s3-verify-doc-${randomSuffix}.pdf`);

    const uploadRes = await fetch(`${baseUrl}/api/uploads/document`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    console.log("Upload Status:", uploadRes.status);
    console.log("Upload Response Data:", JSON.stringify(uploadData, null, 2));

    if (uploadRes.status === 201 && uploadData.success) {
      console.log("\nSUCCESS! S3 document upload is fully working.");
      console.log("Uploaded Document S3 URL:", uploadData.data.url);
    } else {
      console.error("\nFAILED! Unexpected upload response.");
    }
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

runTest();
