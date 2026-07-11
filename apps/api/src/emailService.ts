import net from "node:net";
import tls from "node:tls";
import { config } from "./config.js";

export function smtpConfigured() {
  return Boolean(config.smtpHost && config.smtpPort && config.smtpUser && config.smtpPass && config.smtpFrom);
}

function encodeHeader(value: string) {
  return /[^\x20-\x7e]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=` : value;
}

function parseFrom(value: string) {
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (!match) return { header: value, address: value.trim() };
  return { header: `${encodeHeader(match[1].trim().replace(/^"|"$/g, ""))} <${match[2].trim()}>`, address: match[2].trim() };
}

function readResponse(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        socket.off("data", onData);
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function command(socket: net.Socket, line: string, expected: number[]) {
  socket.write(`${line}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP command failed: ${line} -> ${response.trim()}`);
  return response;
}

export async function sendVerificationEmail(email: string, code: string) {
  if (!smtpConfigured()) {
    if (config.nodeEnv === "production") throw new Error("SMTP_NOT_CONFIGURED");
    return { sent: false, devCode: code };
  }

  const from = parseFrom(config.smtpFrom);
  const subject = "Project Sekai verification code";
  const body = `Your verification code is: ${code}\n\nThe code is valid for 5 minutes. Ignore this email if you did not request it.`;
  const message = [
    `From: ${from.header}`,
    `To: ${email}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");

  const socket = config.smtpSecure
    ? tls.connect({ host: config.smtpHost, port: config.smtpPort, servername: config.smtpHost })
    : net.connect({ host: config.smtpHost, port: config.smtpPort });

  try {
    await readResponse(socket);
    await command(socket, `EHLO ${config.smtpHost}`, [250]);
    await command(socket, "AUTH LOGIN", [334]);
    await command(socket, Buffer.from(config.smtpUser).toString("base64"), [334]);
    await command(socket, Buffer.from(config.smtpPass).toString("base64"), [235]);
    await command(socket, `MAIL FROM:<${from.address}>`, [250]);
    await command(socket, `RCPT TO:<${email}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    await command(socket, `${message}\r\n.`, [250]);
    await command(socket, "QUIT", [221]);
    return { sent: true };
  } finally {
    socket.end();
  }
}
