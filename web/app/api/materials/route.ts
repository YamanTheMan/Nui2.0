import index from "@/lib/retrieval/course-index.json";
import { COURSE_MATERIALS } from "@/lib/course-catalog";

export function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source");
  const material = COURSE_MATERIALS.find((item) => item.source === source);
  if (!material)
    return Response.json(
      { error: "Course material not found." },
      { status: 404 },
    );
  const chunks = index.chunks.filter((chunk) => chunk.source === source);
  return Response.json(
    { material, chunks },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
