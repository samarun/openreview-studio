import { expect, test } from "@playwright/test";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const API_URL = process.env.TEST_API_URL ?? "http://localhost:4000";
const originalsBucket = process.env.S3_BUCKET_ORIGINALS ?? "originals";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openreview",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openreview-secret"
  }
});

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return JSON.parse(text) as T;
}

async function putOriginalObject(key: string) {
  await s3.send(new PutObjectCommand({
    Bucket: originalsBucket,
    Key: key,
    Body: Buffer.from("openreview e2e object"),
    ContentType: "video/mp4"
  }));
}

test("web reviewer workflow loads dashboard, review, and public share", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `e2e-${suffix}@openreview.local`;
  const password = "e2e-password";
  const registration = await apiRequest<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, organizationName: `E2E Org ${suffix}` })
  });
  const project = await apiRequest<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "E2E Project", organizationId: registration.organization.id })
  }, registration.token);
  const originalKey = `${registration.organization.id}/${project.id}/${suffix}.mp4`;
  await putOriginalObject(originalKey);
  const asset = await apiRequest<{ id: string; versions: Array<{ id: string }> }>("/assets", {
    method: "POST",
    body: JSON.stringify({ projectId: project.id, name: "E2E Asset", originalKey })
  }, registration.token);
  const versionId = asset.versions[0]?.id;

  if (!versionId) {
    throw new Error("Expected asset version to be created");
  }

  await apiRequest(`/review/${versionId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "E2E comment", timeSeconds: 1 })
  }, registration.token);
  const share = await apiRequest<{ token: string }>(`/review/${versionId}/share-links`, {
    method: "POST",
    body: JSON.stringify({})
  }, registration.token);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "E2E Project" })).toBeVisible();

  await page.getByRole("link", { name: "E2E Project" }).click();
  await expect(page.getByText("E2E Asset")).toBeVisible();

  await page.getByRole("link", { name: "E2E Asset" }).click();
  await expect(page.getByText("Version 1")).toBeVisible();
  await page.goto(`/review/${versionId}`);
  await expect(page.getByText("Review E2E Asset")).toBeVisible();
  await expect(page.getByText("E2E comment")).toBeVisible();

  await page.goto(`/share/${share.token}`);
  await expect(page.getByText("External Review")).toBeVisible();
  await expect(page.getByText("E2E Asset")).toBeVisible();
  await expect(page.getByText("E2E comment")).toBeVisible();
});
