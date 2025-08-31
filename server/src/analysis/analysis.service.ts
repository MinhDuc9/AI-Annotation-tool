import { Injectable } from "@nestjs/common";
import { spawn } from "child_process";
import * as path from "path";

@Injectable()
export class AnalysisService {
    analyze(imageUrls: string[]): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const script = path.resolve(
                process.cwd(),
                "../Docs/ai/Bird-Detection-main/analyze_url.py",
            );
            const py = spawn("python3", [script]);
            let data = "";
            let error = "";
            py.stdout.on("data", (chunk) => (data += chunk));
            py.stderr.on("data", (chunk) => (error += chunk));
            py.on("close", (code) => {
                if (code !== 0) {
                    return reject(
                        new Error(
                            error || `Python process exited with code ${code}`,
                        ),
                    );
                }
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(err);
                }
            });
            py.stdin.write(JSON.stringify(imageUrls));
            py.stdin.end();
        });
    }
}
