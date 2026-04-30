export async function uploadFile(
  file: File,
  endpoint = "/api/upload",
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  const fileUrl =
    typeof data?.fileUrl === "string"
      ? data.fileUrl
      : typeof data?.url === "string"
        ? data.url
        : null;

  if (!res.ok || !data.success || !fileUrl) {
    throw new Error(data.error || "File upload failed");
  }

  return fileUrl;
}
