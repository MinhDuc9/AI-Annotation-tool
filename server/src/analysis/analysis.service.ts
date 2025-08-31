// analysis.service.ts
import { Injectable } from "@nestjs/common";
import { spawn } from "child_process";
import * as path from "path";

@Injectable()
export class AnalysisService {
  analyze(imageUrls: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      // server/src/analysis/analysis.service.ts
      const scriptDir = path.resolve(
        process.cwd(),
        "../Docs/ai/Bird-Detection-main"
      );
      const script = path.join(scriptDir, "analyze_url.py");

      const py = spawn("python3", ["-u", script], {
        cwd: scriptDir,            // <— run from the folder that has bird_info.json
        env: { ...process.env },
      });


      let data = "";
      let error = "";

      py.stdout.on("data", (chunk) => (data += chunk.toString()));
      py.stderr.on("data", (chunk) => (error += chunk.toString()));

      py.on("close", (code) => {
        if (code !== 0) {
          return reject(
            new Error(error || `Python process exited with code ${code}`),
          );
        }
        try {
          // Primary: trust the producer (Python) to emit clean JSON
          return resolve(JSON.parse(data));
        } catch (_e) {
          // Fallback: try to grab the last JSON object in the stream
          const start = data.indexOf("{");
          const end = data.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            const maybeJson = data.slice(start, end + 1);
            try {
              return resolve(JSON.parse(maybeJson));
            } catch (e2) {
              return reject(
                new Error(
                  `Failed to parse JSON from Python stdout. First error: ${String(
                    _e,
                  )}. Fallback error: ${String(e2)}. Raw stdout: ${data}`,
                ),
              );
            }
          }
          return reject(
            new Error(
              `Python stdout did not contain JSON. Raw stdout: ${data}\nStderr: ${error}`,
            ),
          );
        }
      });

      // Send the input
      py.stdin.write(JSON.stringify(imageUrls));
      py.stdin.end();
    });
  }
}
