import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Receipt = {
  request_url: string;
  final_url: string;
  redirect_chain: Array<{
    status: number;
    from: string;
    to: string;
  }>;
  http_status: number;
  content_type: string | null;
  retrieved_at_utc: string;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

function parseArgs(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: --url <frozen-url> --payload-out <xlsx> --receipt-out <json>',
      );
    }
    result.set(key.slice(2), value);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const requestUrl = args.get('url');
  const payloadOut = args.get('payload-out');
  const receiptOut = args.get('receipt-out');
  if (!requestUrl || !payloadOut || !receiptOut) {
    throw new Error(
      'Usage: --url <frozen-url> --payload-out <xlsx> --receipt-out <json>',
    );
  }

  const redirectChain: Receipt['redirect_chain'] = [];
  let currentUrl = requestUrl;
  let response: Response | undefined;

  for (let index = 0; ; index += 1) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        accept:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/zip, application/octet-stream;q=0.9, */*;q=0.1',
      },
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      break;
    }
    if (index >= MAX_REDIRECTS) {
      throw new Error('redirect_limit_exceeded');
    }
    const location = response.headers.get('location');
    if (!location) {
      throw new Error(
        'redirect_missing_location status=' + response.status,
      );
    }
    const nextUrl = new URL(location, currentUrl).toString();
    redirectChain.push({
      status: response.status,
      from: currentUrl,
      to: nextUrl,
    });
    currentUrl = nextUrl;
  }

  if (!response.ok) {
    throw new Error(
      'frozen_request_http_failure status=' + response.status,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('frozen_request_empty_payload');
  }

  mkdirSync(dirname(resolve(payloadOut)), { recursive: true });
  writeFileSync(resolve(payloadOut), bytes);

  const receipt: Receipt = {
    request_url: requestUrl,
    final_url: response.url || currentUrl,
    redirect_chain: redirectChain,
    http_status: response.status,
    content_type: response.headers.get('content-type'),
    retrieved_at_utc: new Date().toISOString(),
  };
  mkdirSync(dirname(resolve(receiptOut)), { recursive: true });
  writeFileSync(
    resolve(receiptOut),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  process.stdout.write(
    JSON.stringify({
      request_url: requestUrl,
      final_url: receipt.final_url,
      http_status: receipt.http_status,
      content_type: receipt.content_type,
      byte_size: bytes.byteLength,
      redirect_count: redirectChain.length,
      payload_out: payloadOut,
      receipt_out: receiptOut,
    }) + '\n',
  );
}

await main();
