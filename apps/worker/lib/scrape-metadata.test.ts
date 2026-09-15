import { afterEach, describe, expect, mock, test } from "bun:test";
import type { WorkerJobLogger } from "./types";

mock.module("@aws-sdk/client-s3", () => ({
  PutObjectCommand: function PutObjectCommand() {},
  S3Client: function S3Client() {
    return { send: mock() };
  },
}));

mock.module("@myakiba/env/worker", () => ({
  env: {
    AWS_BUCKET_NAME: "test-bucket",
    AWS_BUCKET_REGION: "us-east-1",
  },
}));

mock.module("./utils", () => ({
  createFetchOptions: () => ({}),
  publishJobStatus: mock(),
  recordItemOutcome: mock(),
}));

const { scrapeSingleItem } = await import("./scrape");

const originalFetch = globalThis.fetch;
const auditMock = Object.assign(mock(), { deny: mock() });
const log: WorkerJobLogger = {
  audit: auditMock,
  emit: mock(),
  error: mock(),
  getContext: mock(() => ({})),
  info: mock(),
  set: mock(),
  setLevel: mock(),
  warn: mock(),
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("scrapeSingleItem metadata", () => {
  test("preserves item 1008's Product-line label without inferring Numbering", async () => {
    const html = `
      <html>
        <body>
          <h1 class="title">Vocaloid - Kagamine Rin - Nendoroid (#039) (Good Smile Company)</h1>
          <section class="object item-object">
            <div class="data-field">
              <div class="data-label">Category</div>
              <div class="data-value"><span>Action/Dolls</span></div>
            </div>
            <div class="data-field">
              <div class="data-label">Classification</div>
              <div class="data-value">
                <div class="item-entries">
                  <a class="item-entry" href="/entry/23355"><span switch>Nendoroid (#039)</span></a>
                  <small class="light">as <em>Product line</em></small>
                </div>
              </div>
            </div>
            <div class="data-field">
              <div class="data-label">Dimensions</div>
              <div class="data-value">H=100mm</div>
            </div>
            <div class="data-field">
              <div class="data-label">Various</div>
              <div class="data-value">Warning: a counterfeit version of this item exists.</div>
            </div>
          </section>
        </body>
      </html>
    `;
    globalThis.fetch = Object.assign(
      mock(async () => new Response(html)),
      {
        preconnect: originalFetch.preconnect,
      },
    );

    const item = await scrapeSingleItem({ id: 1008, log });

    expect(item).toMatchObject({
      title: "Vocaloid - Kagamine Rin - Nendoroid (#039) (Good Smile Company)",
      mfcTitle: null,
      numbering: null,
      height: 100,
      width: null,
      depth: null,
      classification: [{ id: 23_355, name: "Nendoroid (#039)", role: "Product line" }],
    });
  });

  test("reads item 2472376's Title and Numbering", async () => {
    const html = `
      <h1 class="title">Kage no Jitsuryokusha ni Naritakute! 2nd Season - Blu-ray - 1 - The Eminence in Shadow 2nd Season Vol.1 (Kadokawa, Nexus)</h1>
      <section class="object item-object">
        <div class="data-field">
          <div class="data-label">Category</div>
          <div class="data-value"><span>Video</span></div>
        </div>
        <div class="data-field">
          <div class="data-label">Numbering</div>
          <div class="data-value">1</div>
        </div>
        <div class="data-field">
          <div class="data-label">Title</div>
          <div class="data-value">The Eminence in Shadow 2nd Season Vol.1</div>
        </div>
      </section>
    `;
    globalThis.fetch = Object.assign(
      mock(async () => new Response(html)),
      {
        preconnect: originalFetch.preconnect,
      },
    );

    const item = await scrapeSingleItem({ id: 2_472_376, log });

    expect(item).toMatchObject({
      category: "Video",
      mfcTitle: "The Eminence in Shadow 2nd Season Vol.1",
      numbering: "1",
    });
  });

  test("preserves item 1730863's non-Media Numbering", async () => {
    const html = `
      <h1 class="title">Yofukashi no Uta - Nanakusa Nazuna - Dakimakura Cover - Doujin Goods - A - Casual (Dakimakuri)</h1>
      <section class="object item-object">
        <div class="data-field">
          <div class="data-label">Category</div>
          <div class="data-value"><span>Linens</span></div>
        </div>
        <div class="data-field">
          <div class="data-label">Numbering</div>
          <div class="data-value">A</div>
        </div>
        <div class="data-field">
          <div class="data-label">Dimensions</div>
          <div class="data-value">W=500mm L=1,600mm</div>
        </div>
      </section>
    `;
    globalThis.fetch = Object.assign(
      mock(async () => new Response(html)),
      {
        preconnect: originalFetch.preconnect,
      },
    );

    const item = await scrapeSingleItem({ id: 1_730_863, log });

    expect(item).toMatchObject({
      category: "Linens",
      numbering: "A",
      width: 500,
      depth: 1600,
    });
  });
});
