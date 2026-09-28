import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Receipt = {
  schema: 'hat47x.structured-artifact-sai2-offline-payload-receipt/v0';
  source_id: string;
  request_url: string;
  final_url: string;
  redirect_chain: Array<{
    status: number;
    from: string;
    to: string;
  }>;
  http_status: number;
  content_type: string;
  byte_size: number;
  sha256: string;
  retrieved_at_utc: string;
  workbook_semantic_inspection_performed: false;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;
const ACCEPTED_CONTENT_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
]);

function parseArgs(argv: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: --source-id <id> --url <frozen-url> --payload-out <xlsx> --receipt-out <json>',
      );
    }
    result.set(key.slice(2), value);
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceId = args.get('source-id');
  const requestUrl = args.get('url');
  const payloadOut = args.get('payload-out');
  const receiptOut = args.get('receipt-out');
  if (!sourceId || !requestUrl || !payloadOut || !receiptOut) {
    throw new Error(
      'Usage: --source-id <id> --url <frozen-url> --payload-out <xlsx> --receipt-out <json>',
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
    if (new URL(nextUrl).protocol !== 'https:') {
      throw new Error(
        'redirect_non_https_target url=' + nextUrl,
      );
    }
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

  const contentType = response.headers.get('content-type');
  const mediaType = contentType
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    !contentType
    || !mediaType
    || !ACCEPTED_CONTENT_TYPES.has(mediaType)
  ) {
    throw new Error(
      'frozen_request_unexpected_content_type value='
      + String(contentType),
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('frozen_request_empty_payload');
  }
  const sha256 =
    'sha256:' + createHash('sha256').update(bytes).digest('hex');

  mkdirSync(dirname(resolve(payloadOut)), { recursive: true });
  writeFileSync(resolve(payloadOut), bytes);

  const receipt: Receipt = {
    schema:
      'hat47x.structured-artifact-sai2-offline-payload-receipt/v0',
    source_id: sourceId,
    request_url: requestUrl,
    final_url: response.url || currentUrl,
    redirect_chain: redirectChain,
    http_status: response.status,
    content_type: contentType,
    byte_size: bytes.byteLength,
    sha256,
    retrieved_at_utc: new Date().toISOString(),
    workbook_semantic_inspection_performed: false,
  };
  mkdirSync(dirname(resolve(receiptOut)), { recursive: true });
  writeFileSync(
    resolve(receiptOut),
    JSON.stringify(receipt) + '\n',
    'utf8',
  );

  process.stdout.write(
    JSON.stringify({
      source_id: sourceId,
      request_url: requestUrl,
      final_url: receipt.final_url,
      http_status: receipt.http_status,
      content_type: receipt.content_type,
      byte_size: receipt.byte_size,
      sha256: receipt.sha256,
      redirect_count: redirectChain.length,
      payload_out: payloadOut,
      receipt_out: receiptOut,
    }) + '\n',
  );
}

await main();
