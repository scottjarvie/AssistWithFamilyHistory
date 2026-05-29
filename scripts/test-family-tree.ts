/**
 * Pedigree-collapse regression test for getFamilyTree (GEN-102B).
 *
 * The original getFamilyTree used a single shared `visited` Set across the
 * whole ancestor recursion, so any person reachable via two lineages
 * (cousin marriage / pedigree collapse) was expanded on the FIRST path only
 * and silently dropped (returned `[]`) on the second. This test builds a
 * cousin-marriage pedigree and asserts the shared ancestor expands on BOTH
 * paths, while a genuine cycle is still bounded.
 *
 * The traversal logic lives in pure helpers (buildAncestors /
 * buildDescendants) that take a FamilyTreeReader, so it can be exercised here
 * against an in-memory fixture without a live Convex backend.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  buildAncestors,
  buildDescendants,
  type FamilyTreeNode,
  type FamilyTreeReader,
} from "@/convex/relationships";

// -- Fixture graph ------------------------------------------------------

type PersonFixture = { id: string; name: string };
// rel: child <- parent (ParentChild where person1 = parent, person2 = child)
type RelFixture = { parent: string; child: string };

function makeReader(persons: PersonFixture[], rels: RelFixture[]): FamilyTreeReader {
  const personById = new Map<string, Doc<"persons">>();
  for (const p of persons) {
    personById.set(
      p.id,
      { _id: p.id, displayName: p.name } as unknown as Doc<"persons">
    );
  }

  const relDocs = rels.map(
    (r, i) =>
      ({
        _id: `rel_${i}`,
        type: "ParentChild",
        person1: r.parent,
        person2: r.child,
        childRelationType: undefined,
      }) as unknown as Doc<"relationships">
  );

  return {
    getPerson: async (personId: Id<"persons">) =>
      personById.get(personId as unknown as string) ?? null,
    getParentRels: async (childId: Id<"persons">) =>
      relDocs.filter((r) => r.person2 === (childId as unknown as string)),
    getChildRels: async (parentId: Id<"persons">) =>
      relDocs.filter((r) => r.person1 === (parentId as unknown as string)),
  };
}

function nameOf(node: FamilyTreeNode): string {
  return node.person.displayName ?? "(unnamed)";
}

function findNode(nodes: FamilyTreeNode[], name: string): FamilyTreeNode | undefined {
  for (const n of nodes) {
    if (nameOf(n) === name) return n;
    const deeper = findNode(n.ancestors ?? [], name);
    if (deeper) return deeper;
  }
  return undefined;
}

function collectNames(nodes: FamilyTreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(nameOf(n));
    out.push(...collectNames(n.ancestors ?? []));
  }
  return out;
}

// -- 1. Cousin-marriage pedigree collapse -------------------------------
//
//                    shared
//                   /      \
//                gpMom     gpDad
//                  |         |
//                 mom       dad
//                   \       /
//                    root
//
// `shared` is reachable through BOTH the maternal and paternal lines.

const persons: PersonFixture[] = [
  { id: "root", name: "Root" },
  { id: "mom", name: "Mom" },
  { id: "dad", name: "Dad" },
  { id: "gpMom", name: "GpMom" },
  { id: "gpDad", name: "GpDad" },
  { id: "shared", name: "Shared" },
];

const rels: RelFixture[] = [
  { parent: "mom", child: "root" },
  { parent: "dad", child: "root" },
  { parent: "gpMom", child: "mom" },
  { parent: "gpDad", child: "dad" },
  { parent: "shared", child: "gpMom" },
  { parent: "shared", child: "gpDad" },
];

const reader = makeReader(persons, rels);

function collectDescNames(nodes: FamilyTreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(nameOf(n));
    out.push(...collectDescNames(n.descendants ?? []));
  }
  return out;
}

describe("getFamilyTree pedigree-collapse regression (GEN-102B)", () => {
  test("shared ancestor expands on BOTH lineages (cousin-marriage)", async () => {
    // maxGenerations large enough to reach `shared` (root->parent->gp->shared = depth 3,
    // expanded at levels 1..3, so need maxGenerations >= 4 under `level >= max` bound).
    const ancestors = await buildAncestors(reader, "root" as Id<"persons">, 1, 10);

    const mom = findNode(ancestors, "Mom");
    const dad = findNode(ancestors, "Dad");
    assert.ok(mom, "Mom should be in the tree");
    assert.ok(dad, "Dad should be in the tree");

    // The shared ancestor must appear under BOTH grandparents — this is the bug:
    // with a single global visited Set the second occurrence was dropped.
    const sharedViaMom = findNode(mom!.ancestors ?? [], "Shared");
    const sharedViaDad = findNode(dad!.ancestors ?? [], "Shared");
    assert.ok(
      sharedViaMom,
      "Shared ancestor must expand on the maternal path (pedigree collapse)"
    );
    assert.ok(
      sharedViaDad,
      "Shared ancestor must expand on the paternal path (pedigree collapse) — this was the dropped subtree"
    );

    // And it must appear exactly twice (once per lineage), proving both paths expanded.
    const sharedCount = collectNames(ancestors).filter((n) => n === "Shared").length;
    assert.equal(
      sharedCount,
      2,
      `Shared ancestor should appear once per lineage (2 total), got ${sharedCount}`
    );
  });

  test("genuine cycle is bounded (no infinite recursion)", async () => {
    // A pathological self-ancestry loop (a <- b <- a ...) must terminate via
    // the per-path visited guard rather than recursing forever.
    const cyclePersons: PersonFixture[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const cycleRels: RelFixture[] = [
      { parent: "b", child: "a" }, // B is parent of A
      { parent: "a", child: "b" }, // A is parent of B (cycle)
    ];
    const cycleReader = makeReader(cyclePersons, cycleRels);

    // If this returns at all (rather than hanging / blowing the stack) the cycle
    // is bounded. A's parent B expands once; B's parent A is re-listed as a leaf
    // node but the per-path visited set stops it from expanding A's parents again.
    const cycleTree = await buildAncestors(cycleReader, "a" as Id<"persons">, 1, 100);
    const bNode = cycleTree.find((n) => nameOf(n) === "B");
    assert.ok(bNode, "B should expand once as A's parent");
    const aUnderB = (bNode!.ancestors ?? []).find((n) => nameOf(n) === "A");
    assert.ok(aUnderB, "A is re-listed as B's parent (one hop)");
    assert.deepEqual(
      aUnderB!.ancestors,
      [],
      "Cycle back to A on the same path must NOT expand further (no infinite recursion)"
    );
  });

  test("generation cap is honored (maxGenerations=2)", async () => {
    // With the same cousin pedigree but maxGenerations=2, expansion stops before
    // reaching the grandparents/shared ancestor.
    const shallow = await buildAncestors(reader, "root" as Id<"persons">, 1, 2);
    assert.ok(findNode(shallow, "Mom"), "Mom (level 1) within a 2-gen cap");
    assert.equal(
      findNode(shallow, "GpMom"),
      undefined,
      "Grandparents should be beyond a 2-generation cap"
    );
  });

  test("descendants traversal reaches root via both lineages", async () => {
    // Symmetric check: from `shared`, descendants should reach root via both
    // grandparents, and root should appear twice (one per lineage).
    const descendants = await buildDescendants(reader, "shared" as Id<"persons">, 1, 10);
    const rootDescCount = collectDescNames(descendants).filter((n) => n === "Root").length;
    assert.equal(
      rootDescCount,
      2,
      `Root should be reachable as a descendant via both lineages (2 total), got ${rootDescCount}`
    );
  });
});
