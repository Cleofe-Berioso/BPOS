import { NextResponse } from "next/server";
import { requireBploSession } from "@/lib/bplo-api";
import { listBploBusinessMapLocations } from "@/lib/business-location";
import type { MapBusinessCategory } from "@/lib/business-map-categories";

function parseType(value: string | null): "ALL" | "NEW" | "RENEWAL" {
  if (value === "NEW" || value === "RENEWAL") {
    return value;
  }

  return "ALL";
}

function parseCategory(value: string | null): "ALL" | MapBusinessCategory {
  if (
    value === "SOLE_PROPRIETORSHIP" ||
    value === "PARTNERSHIP" ||
    value === "CORPORATION" ||
    value === "ONE_PERSON_CORPORATION" ||
    value === "COOPERATIVE"
  ) {
    return value;
  }

  return "ALL";
}

export async function GET(req: Request) {
  const session = await requireBploSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rows = await listBploBusinessMapLocations({
    type: parseType(searchParams.get("type")),
    owner: searchParams.get("owner") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: parseCategory(searchParams.get("category")),
  });

  return NextResponse.json({ rows });
}
