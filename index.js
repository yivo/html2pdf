import "log-timestamp";
import _ from "lodash";
import express from "express";
import bodyparser from "body-parser";
import crypto from "crypto";
import fs, { promises as fsPromises } from "fs";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const app = express();
app.use(bodyparser.json({ limit: "32mb" }));

async function storeTemporaryFile(contents, extension) {
  let fileName = crypto.randomUUID()
  if (extension) {
    fileName += `.${extension}`
  }
  const filePath = path.join(os.tmpdir(), fileName);
  await fsPromises.writeFile(filePath, contents);
  return filePath;
}

const PDF_GENERATION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

function convertOptionNameToAPIParameterFormat(name) {
  return name.replace(/^--/, "").replace(/-/g, "_")
}

function convertOptionNameToCommandLineFormat(name) {
  return "--" + name.replace(/_/g, "-")
}

const PERMITTED_OPTIONS_BOOLEAN = Object.freeze(_.map([
  "--collate",
  "--no-collate",
  "--grayscale",
  "--lowquality",
  "--no-pdf-compression",
  "--read-args-from-stdin",
  "--use-xserver",
  "--dump-default-toc-xsl",
  "--outline",
  "--no-outline",
  "--background",
  "--no-background",
  "--custom-header-propagation",
  "--no-custom-header-propagation",
  "--debug-javascript",
  "--no-debug-javascript",
  "--default-header",
  "--disable-external-links",
  "--enable-external-links",
  "--disable-forms",
  "--enable-forms",
  "--images",
  "--no-images",
  "--disable-internal-links",
  "--enable-internal-links",
  "--disable-javascript",
  "--enable-javascript",
  "--keep-relative-links",
  "--disable-local-file-access",
  "--enable-local-file-access",
  "--exclude-from-outline",
  "--include-in-outline",
  "--disable-plugins",
  "--enable-plugins",
  "--print-media-type",
  "--no-print-media-type",
  "--proxy-hostname-lookup",
  "--resolve-relative-links",
  "--disable-smart-shrinking",
  "--enable-smart-shrinking",
  "--stop-slow-scripts",
  "--no-stop-slow-scripts",
  "--disable-toc-back-links",
  "--enable-toc-back-links",
  "--footer-line",
  "--no-footer-line",
  "--header-line",
  "--no-header-line",
  "--disable-dotted-lines",
  "--disable-toc-links",
]))

const PERMITTED_OPTIONS_VALUE = Object.freeze(_.map([
  "--copies",
  "--dpi",
  "--image-dpi",
  "--image-quality",
  "--margin-bottom",
  "--margin-left",
  "--margin-right",
  "--margin-top",
  "--orientation",
  "--page-height",
  "--page-size",
  "--page-width",
  "--title",
  "--outline-depth",
  "--bypass-proxy-for",
  "--encoding",
  "--javascript-delay",
  "--load-error-handling",
  "--load-media-error-handling",
  "--minimum-font-size",
  "--page-offset",
  "--password",
  "--proxy",
  "--run-script",
  "--ssl-key-password",
  "--username",
  "--viewport-size",
  "--window-status",
  "--zoom",
  "--footer-center",
  "--footer-font-name",
  "--footer-font-size",
  "--footer-left",
  "--footer-right",
  "--footer-spacing",
  "--header-center",
  "--header-font-name",
  "--header-font-size",
  "--header-left",
  "--header-right",
  "--header-spacing",
  "--toc-header-text",
  "--toc-level-indentation",
  "--toc-text-size-shrink",
], convertOptionNameToAPIParameterFormat))

const PERMITTED_OPTIONS_NAME_VALUE = Object.freeze(_.map([
  "--cookie",
  "--custom-header",
  "--post",
  "--replace",
], convertOptionNameToAPIParameterFormat))

const PERMITTED_OPTIONS_FILE_NAME_FILE_PATH = Object.freeze([
  "--post-file",
])

const PERMITTED_OPTIONS_FILE_PATH = Object.freeze(_.map([
  "--header-html",
  "--footer-html",
  "--checkbox-checked-svg",
  "--checkbox-svg",
  "--radiobutton-checked-svg",
  "--radiobutton-svg",
  "--ssl-crt-path",
  "--user-style-sheet",
  "--xsl-style-sheet",
  "--ssl-key-path",
  "--cookie-jar",
], convertOptionNameToAPIParameterFormat))

const OPTION_TO_FILE_EXTENSION = Object.freeze({
  "--header-html": "html",
  "--footer-html": "html",
  "--checkbox-checked-svg": "svg",
  "--checkbox-svg": "svg",
  "--radiobutton-checked-svg": "svg",
  "--radiobutton-svg": "svg",
  "--ssl-crt-path": "cert",
  "--user-style-sheet": "css",
  "--xsl-style-sheet": "css",
  "--ssl-key-path": "pem",
  "--cookie-jar": "jar",
})

app.post("/", async (req, res) => {
  const options = ["--log-level", "warn"]
  const temporaryFilesToCleanup = []

  try {

    // Body HTML (mandatory)
    const bodyHTML = _.trim(req.body.body_html)
    if (bodyHTML === "") {
      return res.status(422).json({ error: "body_html can't be blank" }).end()
    }

    for (const optionName of PERMITTED_OPTIONS_BOOLEAN) {
      let optionValue = req.body[optionName]
      if (optionValue === null || optionValue === undefined) { continue }

      if (typeof optionValue === "boolean" && optionValue === true) {
        options.push(convertOptionNameToCommandLineFormat(optionName))
      }
    }

    for (const optionName of PERMITTED_OPTIONS_VALUE) {
      let optionValue = req.body[optionName]
      if (optionValue === null || optionValue === undefined) { continue }

      options.push(convertOptionNameToCommandLineFormat(optionName), optionValue)
    }

    for (const optionName of PERMITTED_OPTIONS_FILE_NAME_FILE_PATH) {
      const optionValue = req.body[optionName]
      if (!_.isArray(optionValue)) { continue }

      for (const item of optionValue) {
        if (!_.isArray(item) || item.length !== 2) { continue }

        const filePath = await storeTemporaryFile(item[1])
        temporaryFilesToCleanup.push(filePath)
        options.push(convertOptionNameToCommandLineFormat(optionName), item[0], filePath)
      }
    }

    for (const optionName of PERMITTED_OPTIONS_FILE_PATH) {
      const optionValue = req.body[optionName]
      if (optionValue === null || optionValue === undefined || req.body[optionName] === "") { continue }

      const convertedOptionName = convertOptionNameToCommandLineFormat(optionName)
      const filePath = await storeTemporaryFile(optionValue, OPTION_TO_FILE_EXTENSION[convertedOptionName])
      temporaryFilesToCleanup.push(filePath)
      options.push(convertedOptionName, optionName.endsWith("html") ? `file://${filePath}` : filePath)
    }

    for (const optionName of PERMITTED_OPTIONS_NAME_VALUE) {
      const optionValue = req.body[optionName]
      if (!_.isArray(optionValue)) { continue }

      for (const item of optionValue) {
        if (!_.isArray(item) || item.length !== 2) { continue }

        options.push(convertOptionNameToCommandLineFormat(optionName), item[0], item[1])
      }
    }

    const bodyHTMLFilePath = await storeTemporaryFile(bodyHTML, "html")
    temporaryFilesToCleanup.push(bodyHTMLFilePath)
    options.push(bodyHTMLFilePath)

    const pdfFilePath = path.join(os.tmpdir(), `${crypto.randomUUID()}.pdf`)
    temporaryFilesToCleanup.push(pdfFilePath)
    options.push(pdfFilePath)

    req.setTimeout(PDF_GENERATION_TIMEOUT);
    const time = Date.now();
    console.log(`wkhtmltopdf ${options.join(" ")}`);
    const pdfProcess = spawn("wkhtmltopdf", options, { timeout: PDF_GENERATION_TIMEOUT });

    pdfProcess.stdout.on("data", (data) => {
      console.log(`wkhtmltopdf: ${data.toString("UTF-8")}`);
    });

    pdfProcess.stderr.on("data", (data) => {
      console.log(`wkhtmltopdf: ${data.toString("UTF-8")}`);
    });

    req.on("close", () => {
      if (!res.writableEnded && pdfProcess.exitCode === null) {
        console.log("Client disconnected prematurely. Killing wkhtmltopdf process...");
        pdfProcess.kill("SIGKILL");
      }
    });

    await new Promise((resolve, reject) => {
      pdfProcess.on("close", (code) => {
        if (code === 0) {
          console.log(`PDF generated in ${Date.now() - time} ms`);
          resolve();
        } else {
          reject(new Error(`wkhtmltopdf exited with code ${code}`));
        }
      });
      pdfProcess.on("error", reject);
    });

    res.contentType("application/pdf");

    const readStream = fs.createReadStream(pdfFilePath);
    readStream.pipe(res);

    await new Promise((resolve, reject) => {
      readStream.on("end", resolve);
      readStream.on("error", reject);
    });

  } catch (error) {
    console.error(error.message)

    // Don't do anything if we have already started to stream PDF contents to client
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  } finally {
    for (const filePath of temporaryFilesToCleanup) {
      try {
        await fsPromises.unlink(filePath);
      } catch (error) {
        console.error(`Failed to delete temporary file ${filePath}:`, error.message);
      }
    }
  }
});

const signalHandler = _.once(() => {
  server.close(() => { process.exit(0) })
})

_.each(["SIGINT", "SIGTERM"], (signal) => {
  process.on(signal, signalHandler)
})

const port = process.env.APP_PORT || 8080
const server = app.listen(port, () => {
  console.log(`Listening on http://0.0.0.0:${port}`)
})
