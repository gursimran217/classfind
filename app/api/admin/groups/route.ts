import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { allGroups, updateGroupLink, setGroupCreated, setGroupApproval, getGroup, recordAudit } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ status: "ok", groups: await allGroups() });
}

export async function PATCH(req: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const sectionCode = String(body.sectionCode ?? "").trim().toUpperCase();
  if (!sectionCode) {
    return NextResponse.json({ status: "invalid", error: "Missing section code." }, { status: 400 });
  }
  const link = body.inviteLink === null || body.inviteLink === undefined || String(body.inviteLink).trim() === ""
    ? null
    : String(body.inviteLink).trim();

  if (link && !/^https:\/\/chat\.whatsapp\.com\//.test(link)) {
    return NextResponse.json(
      { status: "invalid", error: "Invite link must be a chat.whatsapp.com URL." },
      { status: 400 },
    );
  }

  await updateGroupLink(sectionCode, link);
  if (body.created !== undefined) await setGroupCreated(sectionCode, Boolean(body.created));
  if (body.requireApproval !== undefined) await setGroupApproval(sectionCode, Boolean(body.requireApproval));
  await recordAudit({
    action: "update",
    entity: "group",
    entityId: sectionCode,
    detail: { link: link ? "set" : "cleared", created: body.created, requireApproval: body.requireApproval },
  });
  return NextResponse.json({ status: "ok", group: await getGroup(sectionCode) });
}