import { spawn } from "node:child_process";

/**
 * Run a command, feed it `input` on stdin, collect stdout as bytes.
 * Rejects with the process's own stderr, which is what you actually want to read
 * when a model file is missing or a voice id is wrong.
 */
export function runCapturingStdout(command: string, args: string[], input?: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (e) => reject(new Error(`${command} could not start: ${e.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(err).toString().trim().split("\n").slice(-3).join(" ").slice(0, 300);
        return reject(new Error(detail || `${command} exited with code ${code}`));
      }
      resolve(new Uint8Array(Buffer.concat(out)));
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}
