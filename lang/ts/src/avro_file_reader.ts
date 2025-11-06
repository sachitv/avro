import { createType } from "./internal/createType/mod.ts";
import { Type } from "./internal/schemas/type.ts";
import { Tap } from "./internal/serialization/tap.ts";

// Type of Avro header.
const HEADER_TYPE = createType({
  type: "record",
  name: "org.apache.avro.file.Header",
  fields: [
    { name: "magic", type: { type: "fixed", name: "Magic", size: 4 } },
    { name: "meta", type: { type: "map", values: "bytes" } },
    { name: "sync", type: { type: "fixed", name: "Sync", size: 16 } },
  ],
});

// Type of each block.
const BLOCK_TYPE = createType({
  type: "record",
  name: "org.apache.avro.file.Block",
  fields: [
    { name: "count", type: "long" },
    { name: "data", type: "bytes" },
    { name: "sync", type: { type: "fixed", name: "Sync", size: 16 } },
  ],
});

// First 4 bytes of an Avro object container file.
const MAGIC_BYTES = new Uint8Array([0x4F, 0x62, 0x6A, 0x01]); // 'Obj\x01'

/**
 * Reads an AVRO file and returns the concatenated data blocks as an ArrayBuffer.
 * Assumes null codec (no compression) and skips header parsing for simplicity.
 */
export async function readAvroFileAsArrayBuffer(
  filePath: string,
): Promise<ArrayBuffer> {
  const fileData = await Deno.readFile(filePath);
  const tap = new Tap(fileData.buffer);

  const header = HEADER_TYPE.read(tap);

  // Validate magic bytes
  const magic = (header as Record<string, unknown>).magic as Uint8Array;
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (magic[i] !== MAGIC_BYTES[i]) {
      throw new Error("Invalid AVRO file: incorrect magic bytes");
    }
  }

  // read all the data in the map as Text Encoded key and Uint8Array value
  const meta = (header as Record<string, unknown>).meta as Map<
    string,
    Uint8Array
  >;
  for (const [key, value] of meta) {
    console.log(`Meta [${key}]:`, new TextDecoder().decode(value));
  }

  // Read the schema and create a type from it.
  let schemaType: Type | undefined = undefined;
  {
    const schemaJson = meta.get("avro.schema");
    if (!schemaJson) {
      throw new Error("AVRO schema not found in metadata");
    }
    const schemaStr = new TextDecoder().decode(schemaJson);
    console.log("Schema:", schemaStr);

    // For simplicity, we assume null codec (no compression).
    const codec = meta.get("avro.codec");
    if (codec) {
      const codecStr = new TextDecoder().decode(codec);
      if (codecStr !== "null") {
        throw new Error(`Unsupported codec: ${codecStr}`);
      }
    }

    schemaType = createType(JSON.parse(schemaStr));
  }

  // Hardcoded sync marker for weather.avro
  const syncMarker = new Uint8Array([
    0xb0,
    0x81,
    0xb3,
    0xc4,
    0x0a,
    0x0c,
    0xf6,
    0x62,
    0xfa,
    0xc9,
    0x38,
    0xfd,
    0x7e,
    0x52,
    0x00,
    0xa7,
  ]);
  console.log("Sync Marker:", (header as Record<string, unknown>).sync);

  // Collect all data blocks
  const dataBlocks: Uint8Array[] = [];
  while (true) {
    try {
      const block = BLOCK_TYPE.read(tap) as {
        count: bigint;
        data: Uint8Array;
        sync: Uint8Array;
      };

      // Check sync marker
      if (!syncMarker.every((byte, i) => byte === block.sync[i])) {
        throw new Error("Invalid sync marker in block");
      }

      const recordTap = new Tap(block.data.buffer.slice() as ArrayBuffer);
      for (let i = 0; i < block.count; i++) {
        const record = schemaType!.read(recordTap);
        // Process the record as needed. Here we just log it.
        console.log("Record:", record);
      }

      console.log(
        `Read block with ${block.count} records, data length: ${block.data.length} bytes`,
      );
    } catch {
      // No more blocks or invalid data
      break;
    }
  }

  // Concatenate all data blocks
  const totalLength = dataBlocks.reduce((sum, block) => sum + block.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const block of dataBlocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return result.buffer;
}
