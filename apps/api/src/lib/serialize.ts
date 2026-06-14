export function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function serializeJson(payload: unknown) {
  return JSON.stringify(payload, jsonReplacer);
}
