import { readAvroFileAsArrayBuffer } from "./src/avro_file_reader.ts";

async function main() {
  try {
    const buffer = await readAvroFileAsArrayBuffer(
      "/workspaces/avro/share/test/data/weather.avro",
    );
    console.log(`Successfully read AVRO file: ${buffer.byteLength} bytes`);
  } catch (error) {
    console.error("Error reading AVRO file:", error);
  }
}

main();
