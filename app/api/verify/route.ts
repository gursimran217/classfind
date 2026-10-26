import { NextResponse } from "next/server";
import { findStudentByNameAndPhone, getSection, getGroup, ensureConfigSynced } from "@/lib/db";
import { normalizePhone, normalizeName, formatPhone } from "@/lib/normalize";
import { floorLabel } from "@/lib/sections-data";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  await ensureConfigSynced();
  if (!rateLimit(clientIp(req), 12, 60_000)) {
    return json({ status: "rate_limited", error: "Too many attempts. Please wait a minute and try again." }, 429);
  }

  let body: { name?: string; mobile?: string };
  try {
    body = await req.json();
  } catch {
    return json({ status: "invalid", error: "Request could not be read." }, 400);
  }

  const rawName = (body.name ?? "").toString().trim();
  const rawMobile = (body.mobile ?? "").toString().trim();

  if (!rawName) {
    return json({ status: "invalid", error: "Please enter your full name." }, 400);
  }
  if (normalizeName(rawName).length < 3) {
    return json({ status: "invalid", error: "That name looks too short. Enter the full name used during admission." }, 400);
  }

  const mobile10 = normalizePhone(rawMobile);
  if (!mobile10) {
    return json(
      {
        status: "invalid",
        error: "That mobile number doesn't look right. Check the number used during admission.",
      },
      400,
    );
  }

  const matches = await findStudentByNameAndPhone(rawName, rawMobile);

  if (matches.length === 0) {
    return json({
      status: "not_found",
      error: "Couldn't find your details.",
      hint: "Check that you're using the same name and mobile number submitted during admission.",
    });
  }

  if (matches.length > 1) {
    return json({
      status: "ambiguous",
      error: "We found more than one possible record for this name and number.",
      hint: "Please contact the admission helpdesk so we can confirm your class safely.",
    });
  }

  const student = matches[0];
  const section = await getSection(student.section);
  const group = await getGroup(student.section);

  const classroom =
    section && section.active
      ? {
          roomNumber: section.roomNumber,
          floor: section.floor,
          floorLabel: section.floor != null ? floorLabel(section.floor) : null,
          building: section.building,
          campus: section.campus,
          mappingStatus: section.mappingStatus,
        }
      : null;

  return json({
    status: "ok",
    data: {
      name: student.name,
      mobile: student.mobile,
      mobileDisplay: formatPhone(student.mobile),
      program: student.program,
      section: student.section,
      rollNumber: student.rollNumber,
      classroom,
      classroomUnavailable: !classroom,
      group: group
        ? {
            sectionCode: group.sectionCode,
            groupName: group.groupName,
            // Security: the invite link is NEVER exposed to the student client.
            // It is delivered to the verified mobile number via the invite send API.
            hasInvite: Boolean(group.inviteLink),
            status: group.status,
            created: Boolean(group.created),
            requireApproval: Boolean(group.requireApproval),
          }
        : null,
    },
  });
}