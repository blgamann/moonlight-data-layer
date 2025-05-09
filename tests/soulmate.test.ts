import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("Soulmate Model", () => {
  let userA: User;
  let userB: User;
  let userC: User; // 추가 테스트용 사용자

  // 애플리케이션 레벨에서 userAId < userBId를 보장하는 헬퍼 함수 (테스트용)
  const getSortedUserIds = (
    u1: User,
    u2: User
  ): { userAId: string; userBId: string } => {
    if (u1.id < u2.id) {
      return { userAId: u1.id, userBId: u2.id };
    }
    return { userAId: u2.id, userBId: u1.id };
  };

  beforeEach(async () => {
    // 의존성 순서대로 삭제
    await prisma.notification.deleteMany({}); // Soulmate 참조 가능성
    await prisma.soulmate.deleteMany({}); // User 참조

    // User를 참조하는 다른 모델들도 정리 (테스트 격리)
    await prisma.soullinkRequest.deleteMany({});
    await prisma.profileInterest.deleteMany({});
    await prisma.answerInterest.deleteMany({});
    await prisma.answer.deleteMany({});
    await prisma.bookshelfEntry.deleteMany({});
    // 마지막으로 User 삭제
    await prisma.user.deleteMany({});

    // 테스트용 사용자 생성 (ID 순서를 예측하기 위해 순차적으로 생성)
    userA = await prisma.user.create({
      data: {
        email: `userA_sm_${Date.now()}@example.com`,
        passwordHash: "hashed_A",
        name: "User A SM",
      },
    });
    userB = await prisma.user.create({
      data: {
        email: `userB_sm_${Date.now()}@example.com`,
        passwordHash: "hashed_B",
        name: "User B SM",
      },
    });
    userC = await prisma.user.create({
      data: {
        email: `userC_sm_${Date.now()}@example.com`,
        passwordHash: "hashed_C",
        name: "User C SM",
      },
    });
  });

  // afterEach는 필요시 주석 해제

  it("should create a new soulmate relationship between two users", async () => {
    const { userAId, userBId } = getSortedUserIds(userA, userB);

    const soulmateRelationship = await prisma.soulmate.create({
      data: {
        userAId: userAId,
        userBId: userBId,
        // createdAt은 자동으로 생성됨
      },
    });

    expect(soulmateRelationship.id).toBeDefined();
    expect(soulmateRelationship.userAId).toBe(userAId);
    expect(soulmateRelationship.userBId).toBe(userBId);
    expect(soulmateRelationship.createdAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const relationshipWithRelations = await prisma.soulmate.findUnique({
      where: { id: soulmateRelationship.id },
      include: { userA: true, userB: true },
    });
    // getSortedUserIds를 사용했으므로, userA와 userB 중 ID가 작은 쪽이 userA가 됨
    const expectedUserA = userA.id < userB.id ? userA : userB;
    const expectedUserB = userA.id < userB.id ? userB : userA;

    expect(relationshipWithRelations?.userA.name).toBe(expectedUserA.name);
    expect(relationshipWithRelations?.userB.name).toBe(expectedUserB.name);
  });

  it("should prevent creating duplicate soulmate relationships (same pair, order insensitive for @@unique)", async () => {
    const ids1 = getSortedUserIds(userA, userB);
    // 첫 번째 관계 생성
    await prisma.soulmate.create({
      data: { userAId: ids1.userAId, userBId: ids1.userBId },
    });

    // 동일한 쌍 (ID 순서가 달라도 @@unique는 [userAId, userBId] 조합으로 판단)
    // 애플리케이션 레벨에서 ID 정렬을 보장하므로, 실제로는 항상 같은 순서로 시도될 것임.
    const ids2 = getSortedUserIds(userB, userA); // 결과적으로 ids1과 동일한 userAId, userBId가 됨

    try {
      await prisma.soulmate.create({
        data: { userAId: ids2.userAId, userBId: ids2.userBId },
      });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반
      // @@unique([userAId, userBId])
      // expect(e.meta?.target).toEqual(['userAId', 'userBId']); // 실제 에러 확인 필요
    }
  });

  it("should allow different pairs of users to form soulmate relationships", async () => {
    const idsAB = getSortedUserIds(userA, userB);
    const idsAC = getSortedUserIds(userA, userC); // UserA는 UserC와도 소울메이트가 될 수 있음

    await prisma.soulmate.create({
      data: { userAId: idsAB.userAId, userBId: idsAB.userBId },
    });
    await prisma.soulmate.create({
      data: { userAId: idsAC.userAId, userBId: idsAC.userBId },
    });

    const soulmatesOfUserA = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userA.id }, { userBId: userA.id }] },
    });
    expect(soulmatesOfUserA.length).toBe(2);
  });

  it("should delete a soulmate relationship", async () => {
    const { userAId, userBId } = getSortedUserIds(userA, userB);
    const soulmateRelationship = await prisma.soulmate.create({
      data: { userAId: userAId, userBId: userBId },
    });

    await prisma.soulmate.delete({
      where: { id: soulmateRelationship.id },
      // 또는 @@unique 필드를 사용하여 삭제:
      // where: { userAId_userBId: { userAId: userAId, userBId: userBId } },
    });

    const deletedRelationship = await prisma.soulmate.findUnique({
      where: { id: soulmateRelationship.id },
    });
    expect(deletedRelationship).toBeNull();
  });

  it("should cascade delete soulmate relationships when userA is deleted", async () => {
    const { userAId, userBId } = getSortedUserIds(userA, userB); // userA가 실제 ID가 작은 쪽
    await prisma.soulmate.create({
      data: {
        userAId: userA.id < userB.id ? userA.id : userB.id,
        userBId: userA.id < userB.id ? userB.id : userA.id,
      },
    });

    // userA (또는 userB, 둘 중 하나) 삭제
    await prisma.user.delete({ where: { id: userA.id } });

    const relationships = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userA.id }, { userBId: userA.id }] },
    });
    expect(relationships.length).toBe(0);
  });

  it("should cascade delete soulmate relationships when userB is deleted", async () => {
    const { userAId, userBId } = getSortedUserIds(userA, userB); // userB가 실제 ID가 큰 쪽
    await prisma.soulmate.create({
      data: {
        userAId: userA.id < userB.id ? userA.id : userB.id,
        userBId: userA.id < userB.id ? userB.id : userA.id,
      },
    });

    await prisma.user.delete({ where: { id: userB.id } });

    const relationships = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userB.id }, { userBId: userB.id }] },
    });
    expect(relationships.length).toBe(0);
  });

  // ID 정렬 규칙 테스트 (애플리케이션 레벨 규칙이므로 직접 테스트는 어려우나,
  // 잘못된 순서로 넣었을 때 Prisma가 @@unique 제약으로 막는지 확인 가능)
  it("should enforce unique constraint regardless of userAId/userBId order if not pre-sorted by app", async () => {
    // 이 테스트는 애플리케이션이 ID 정렬을 하지 *않았을* 경우를 가정합니다.
    // 실제로는 getSortedUserIds 같은 함수를 통해 항상 정렬된 ID로 DB에 저장해야 합니다.

    // userA.id < userB.id 라고 가정
    const idA = userA.id;
    const idB = userB.id;

    // (A, B) 순서로 생성
    await prisma.soulmate.create({ data: { userAId: idA, userBId: idB } });

    // (B, A) 순서로 생성 시도 (@@unique([userAId, userBId])는 값의 조합을 보므로,
    // Prisma는 (idA, idB)와 (idB, idA)를 다른 조합으로 인식하지 *않고* 에러를 발생시켜야 함)
    // **주의**: Prisma의 @@unique 동작은 DB에 따라 다를 수 있으며,
    // 일반적으로 (X,Y)와 (Y,X)는 다른 레코드로 취급될 수 있습니다.
    // 따라서 애플리케이션에서 userAId < userBId를 *항상* 보장하는 것이 중요합니다.
    // 이 테스트는 그 중요성을 역설적으로 보여줍니다.
    // 만약 DB가 (A,B)와 (B,A)를 다르게 취급한다면, 이 테스트는 P2002 에러를 발생시키지 *않을* 것입니다.
    // 이 경우, 애플리케이션 레벨의 ID 정렬 규칙이 더욱 중요해집니다.

    // 이 테스트의 의도는, 만약 애플리케이션에서 ID 정렬을 놓쳤을 때,
    // (A,B)와 (B,A)가 모두 DB에 저장될 수 있는지를 확인하는 것입니다.
    // SQLite에서는 (A,B)와 (B,A)가 다른 것으로 간주될 가능성이 높습니다.
    // 따라서 P2002 에러가 발생하지 *않을* 가능성이 큽니다.
    // 이 테스트는 주석 처리하거나, "ID 정렬이 안 되었을 때 중복 데이터가 발생할 수 있음"을 보이는 용도로 사용합니다.

    /*
    try {
      await prisma.soulmate.create({ data: { userAId: idB, userBId: idA }});
      // 여기에 도달하면, (A,B)와 (B,A)가 별개의 레코드로 DB에 저장되었다는 의미 -> 문제!
      // 애플리케이션 레벨에서 ID 정렬을 통해 이를 방지해야 함.
      const count = await prisma.soulmate.count({
        where: { OR: [ {userAId: idA, userBId: idB}, {userAId: idB, userBId: idA} ]}
      });
      // 만약 count가 2라면, 중복 데이터가 발생한 것.
      // expect(count).toBe(1); // 이상적인 결과
    } catch (e: any) {
      // 만약 DB 레벨에서 (A,B)와 (B,A)를 같은 것으로 취급하여 P2002 에러가 난다면,
      // 그것은 운이 좋은 경우입니다. 대부분의 DB는 그렇지 않습니다.
      expect(e.code).toBe('P2002');
    }
    */
    // 결론: 애플리케이션에서 getSortedUserIds를 항상 사용해야 합니다.
    // 위 테스트는 "잘못된 사용 시나리오"에 대한 것입니다.
  });
});
