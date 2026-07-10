import webpush from "web-push";
import { prisma } from "./prisma.js";
import { getSetting, setSetting } from "./settings.js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function getVapidConfig(): Promise<{ publicKey: string; privateKey: string; subject: string } | null> {
  const [publicKey, privateKey, subject] = await Promise.all([
    getSetting("VAPID_PUBLIC_KEY"),
    getSetting("VAPID_PRIVATE_KEY"),
    getSetting("VAPID_SUBJECT"),
  ]);
  if (!publicKey?.trim() || !privateKey?.trim()) return null;

  return {
    publicKey: publicKey.trim(),
    privateKey: privateKey.trim(),
    subject: subject?.trim() || "mailto:admin@garage.local",
  };
}

export async function isPushConfigured(): Promise<boolean> {
  return (await getVapidConfig()) !== null;
}

export async function getVapidPublicKey(): Promise<string | null> {
  return (await getVapidConfig())?.publicKey ?? null;
}

/** 관리 화면에서 버튼 한 번으로 VAPID 키 쌍을 발급해 DB에 저장 (.env 편집·재시작 불필요) */
export async function generateAndSaveVapidKeys(): Promise<{ publicKey: string }> {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  await Promise.all([setSetting("VAPID_PUBLIC_KEY", publicKey), setSetting("VAPID_PRIVATE_KEY", privateKey)]);
  return { publicKey };
}

async function ensureWebPush(): Promise<boolean> {
  const config = await getVapidConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function sendPushToSubscription(
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<void> {
  if (!(await ensureWebPush())) return;

  const body = JSON.stringify(payload);

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      body,
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error("[push] send failed", sub.id, err);
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(subs.map((sub) => sendPushToSubscription(sub, payload)));
}

export async function getUserIdsForVehicle(vehicleId: string): Promise<string[]> {
  const [admins, access] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
    prisma.userVehicleAccess.findMany({ where: { vehicleId }, select: { userId: true } }),
  ]);
  return [...new Set([...admins.map((u) => u.id), ...access.map((a) => a.userId)])];
}
