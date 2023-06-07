#!/usr/bin/env node
import crypto from "crypto";
import execa from "execa";
import fs from "fs";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const packageJsonPath = "../../apps/cli/package.json";
const packageJson = JSON.parse(
  readFileSync(new URL(packageJsonPath, import.meta.url)),
);

const VERSION = packageJson.version;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tmp = path.join(__dirname, "tmp");
const homebrewDir = path.join(tmp, "envless-homebrew");
const formulaPath = path.join(homebrewDir, "Formula", "envless.rb");
const fileSuffix = ".tar.xz";
const INTEL_ARCH = "x64";
const M1_ARCH = "arm64";

const { GITHUB_SHA_SHORT } = process.env;

const git = async (args, opts = {}) => {
  await execa("git", ["-C", homebrewDir, ...args], opts);
};

async function cloneHomebrewTapRepo() {
  console.log(
    `cloning https://github.com/chetannn/homebrew-tap to ${homebrewDir}`,
  );

  await execa("git", [
    "clone",
    "https://github.com/chetannn/envless-homebrew.git",
    homebrewDir,
  ]);
  console.log(`done cloning envless/homebrew-tap to ${homebrewDir}`);
}

async function getEnvlessFormulaTemplate() {
  const template = fs
    .readFileSync(path.join(__dirname, "envless.rb"))
    .toString("utf-8");

  return template;
}

async function updateEnvlessFormula(template) {
  console.log("updating local git repository...");

  fs.writeFileSync(formulaPath, template);

  await git(["add", "Formula"]);
  // await git(["config", "--local", "core.pager", "cat"]);
  await git(["diff", "--cached"], { stdio: "inherit" });
  await git(["commit", "-m", `envless v${VERSION}`]);
  await git(["push", "origin", "master"]);
}

async function calculateSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", (error) => {
      reject(error);
    });

    stream.on("data", (data) => {
      hash.update(data);
    });

    stream.on("end", () => {
      const sha256Hash = hash.digest("hex");
      resolve(sha256Hash);
    });
  });
}

async function downloadTarballFromS3(s3VersionedFilePath, downloadPath) {
  const commandStr = `aws s3 cp s3://testingcli.envless.dev/${s3VersionedFilePath} ${downloadPath}`;

  return execa.command(commandStr);
}

function getS3PublicUrl(versionedFilePath) {
  return `https://s3.amazonaws.com/testingcli.envless.dev/${versionedFilePath}`;
}

function getS3Prefixes() {
  const fileNamePrefix = `envless-v${VERSION}-${GITHUB_SHA_SHORT}-darwin-`;
  const s3KeyPrefix = `versions/${VERSION}/${GITHUB_SHA_SHORT}`;

  return { fileNamePrefix, s3KeyPrefix };
}

function getVersionedFilePathInS3() {
  const { fileNamePrefix, s3KeyPrefix } = getS3Prefixes();
  const fileParts = [fileNamePrefix, fileSuffix];

  const fileNameM1 = fileParts.join(M1_ARCH);
  return `${s3KeyPrefix}/${fileNameM1}`;
}

function getDownloadPath() {
  const fileName = getFileName();
  const downloadTo = path.join(__dirname, fileName);

  return downloadTo;
}

function getFileName() {
  const { fileNamePrefix } = getS3Prefixes();
  const fileParts = [fileNamePrefix, fileSuffix];

  return fileParts.join(M1_ARCH);
}

async function main() {
  const template = await getEnvlessFormulaTemplate();
  await cloneHomebrewTapRepo();

  const downloadPath = getDownloadPath();
  const versionedFilePathInS3 = getVersionedFilePathInS3();
  const fileName = getFileName();
  await downloadTarballFromS3(versionedFilePathInS3, downloadPath);
  const sha256M1 = await calculateSHA256(path.join(__dirname, fileName));
  const publicUrl = getS3PublicUrl(versionedFilePathInS3);

  const replacedTemplate = template
    .replace("__DOWNLOAD_URL__", publicUrl)
    .replace("__SHA256__", sha256M1);

  await updateEnvlessFormula(replacedTemplate);
}

await main();
