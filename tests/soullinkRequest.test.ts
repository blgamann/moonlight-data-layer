// tests/soullink-request.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("SoullinkRequest Model (transactional)", () => {
  let sender!: User;
  let receiver!: User;

  /** 공통 초기화 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.soullinkRequest.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.profileInterest.deleteMany(),
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();
    const sfx = () => Math.random().toString(36).slice(2, 6);

    [sender, receiver] = await prisma.$transaction(async (tx) => {
      const se = await tx.user.create({
        data: {
          email: `sender_${ts}_${sfx()}@ex.com`,
          passwordHash: "pw_sender",
          name: "Sender",
        },
      });

      const re = await tx.user.create({
        data: {
          email: `receiver_${ts}_${sfx()}@ex.com`,
          passwordHash: "pw_receiver",
          name: "Receiver",
        },
      });
      return [se, re];
    });
  });

  it("creates a SoullinkRequest", async () => {
    const slr = await prisma.$transaction((tx) =>
      tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      })
    );

    expect(slr.senderId).toBe(sender.id);

    const withRel = await prisma.soullinkRequest.findUnique({
      where: { id: slr.id },
      include: { sender: true, receiver: true },
    });
    expect(withRel?.receiver.name).toBe(receiver.name);
  });

  it("blocks duplicate (sender, receiver)", async () => {
    await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });

    await expect(
      prisma.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows same sender → multiple receivers", async () => {
    const otherReceiver = await prisma.user.create({
      data: {
        email: `recv2_${Date.now()}@ex.com`,
        passwordHash: "pw",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      });
      await tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: otherReceiver.id },
      });
    });

    const list = await prisma.soullinkRequest.findMany({
      where: { senderId: sender.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows multiple senders → same receiver", async () => {
    const otherSender = await prisma.user.create({
      data: {
        email: `snd2_${Date.now()}@ex.com`,
        passwordHash: "pw",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      });
      await tx.soullinkRequest.create({
        data: { senderId: otherSender.id, receiverId: receiver.id },
      });
    });

    const list = await prisma.soullinkRequest.findMany({
      where: { receiverId: receiver.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows self-request (DB level)", async () => {
    const selfReq = await prisma.$transaction((tx) =>
      tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: sender.id },
      })
    );
    expect(selfReq).toBeDefined();
  });

  it("deletes a SoullinkRequest", async () => {
    const slr = await prisma.soullinkRequest.create({
      data: { senderId: sender.id, receiverId: receiver.id },
    });

    await prisma.$transaction((tx) =>
      tx.soullinkRequest.delete({ where: { id: slr.id } })
    );

    const shouldBeNull = await prisma.soullinkRequest.findUnique({
      where: { id: slr.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades when sender is deleted", async () => {
    const another = await prisma.user.create({
      data: { email: `a_${Date.now()}@ex.com`, passwordHash: "pw" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      });
      await tx.soullinkRequest.create({
        data: { senderId: another.id, receiverId: sender.id },
      });
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: sender.id } })
    );

    const remain = await prisma.soullinkRequest.findMany({
      where: { OR: [{ senderId: sender.id }, { receiverId: sender.id }] },
    });
    expect(remain.length).toBe(0);
  });

  it("cascades when receiver is deleted", async () => {
    const another = await prisma.user.create({
      data: { email: `a2_${Date.now()}@ex.com`, passwordHash: "pw" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.soullinkRequest.create({
        data: { senderId: sender.id, receiverId: receiver.id },
      });
      await tx.soullinkRequest.create({
        data: { senderId: receiver.id, receiverId: another.id },
      });
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: receiver.id } })
    );

    const remain = await prisma.soullinkRequest.findMany({
      where: { OR: [{ senderId: receiver.id }, { receiverId: receiver.id }] },
    });
    expect(remain.length).toBe(0);
  });
});
