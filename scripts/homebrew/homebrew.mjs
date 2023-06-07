#!/usr/bin/env node
import execa from "execa";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tmp = path.join(__dirname, "tmp");
const homebrewDir = path.join(tmp, "homebrew-tap");
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
    `cloning https://github.com/envless/homebrew-tap to ${homebrewDir}`,
  );

  await execa("git", [
    "clone",
    "https://github.com/envless/homebrew-tap.git",
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

  const replacedTemplate = template
    .replace("__DOWNLOAD_URL__", "https://envless.com")
    .replace("__SHA256__", "some__sha256__here");

  fs.writeFileSync(formulaPath, replacedTemplate);

  await git(["add", "Formula"]);
  // await git(["config", "--local", "core.pager", "cat"]);
  await git(["diff", "--cached"], { stdio: "inherit" });
  await git(["commit", "-m", `envless v0.0.4`]);
  await git(["push", "origin", "main"]);
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
  const { fileNamePrefix } = getS3Prefixes();
  const fileParts = [fileNamePrefix, fileSuffix];

  const fileNameM1 = fileParts.join(M1_ARCH);

  const downloadTo = path.join(__dirname, fileNameM1);

  return downloadTo;
}

async function main() {
  // const template = await getEnvlessFormulaTemplate();
  // await cloneHomebrewTapRepo();

  const downloadPath = getDownloadPath();
  const versionedFilePathInS3 = getVersionedFilePathInS3();
  await downloadTarballFromS3(versionedFilePathInS3, downloadPath);

  // const publicUrl = getS3PublicUrl(versionedFilePathInS3);
  // await updateEnvlessFormula(template, publicUrl);
}

await main();
