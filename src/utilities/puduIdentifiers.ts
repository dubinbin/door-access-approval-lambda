const compactMacPattern = /^[0-9a-f]{12}$/i;
const colonMacPattern = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

const puduDoorIdPrefix = "novelte:";

export const normalizePuduMac = (mac: string | null) => {
  if (typeof mac !== "string" || (!compactMacPattern.test(mac) && !colonMacPattern.test(mac))) {
    return null;
  }

  return mac.replaceAll(":", "").toLowerCase();
};

export const getPuduDoorCode = (doorId: string) => {
  if (typeof doorId !== "string" || doorId.length === 0) {
    return doorId;
  }

  return doorId.startsWith(puduDoorIdPrefix) ? doorId.slice(puduDoorIdPrefix.length) : doorId;
};

export const deduplicatePuduDoorRequests = (requests: { mac: string; from: string; createdAt: string }[]) => {
  const sortedRequests = [...requests].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const seenIdentities = new Set();
  const latestRequests = [];

  for (const request of sortedRequests) {
    const mac = normalizePuduMac(request.mac) || request.mac;
    const identities = [mac, request.from].filter(Boolean);
    if (identities.some((identity) => seenIdentities.has(identity))) {
      continue;
    }
    latestRequests.push(request);
    identities.forEach((identity) => seenIdentities.add(identity));
  }

  return latestRequests;
};

export const findPuduDoorEntity = (siteData: { code: string; class: string }[], doorId: string) => {
  const doorCode = getPuduDoorCode(doorId);
  const doorEntity = siteData.find((entity) => entity.code === doorCode && entity.class === "door");

  return {
    doorCode,
    doorEntity,
  };
};

export const getPuduMacFromTopic = (topic: string) => {
  if (typeof topic !== "string") {
    return null;
  }

  const parts = topic.split("/").filter(Boolean);
  let mac = null;
  if (parts.length === 5 && parts[1] === "key" && parts[3] === "robot" && parts[4] === "accessDoorState") {
    mac = parts[2];
  } else if (parts.length === 4 && parts[0] === "key" && parts[2] === "robot" && parts[3] === "accessDoorState") {
    mac = parts[1];
  }

  return normalizePuduMac(mac) ? mac : null;
};