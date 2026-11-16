import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect, test, vi} from "vitest";
import {normalizeOperationFilters} from "../../lib/vault/operationsRows";
import {OperationsView} from "../../components/operations/OperationsView";
import {buildOperationsHandoffPacket} from "../../lib/operations/handoff";
vi.mock("../../components/collections/CollectionPage", () => ({CollectionPage: ({children}: {children: React.ReactNode}) => children}));
vi.mock("../../components/operations/OperationsCollection", () => ({OperationsCollection: () => null}));
vi.mock("../../components/layout/SafeLink", () => ({SafeLink: ({children}: {children: React.ReactNode}) => children}));
test("approximate status is visible and survives the private handoff", () => {
 const summary = {visibleRows: 0, provisionalRows: 0, missingRequired: 0, missingRecommended: 0, staleChecks: 0, averageCompletion: 0};
 const props = {rows: [], summary, filters: normalizeOperationFilters({}), preferenceKey: "synthetic", loadMoreHref: null, handoffHref: "/api/operations/queue?format=handoff", mode: "user" as const, summaryScope: "vault" as const};
 const approximate = renderToStaticMarkup(React.createElement(OperationsView, {...props, exact: false}));
 expect(approximate).toContain('role="status"'); expect(approximate).toContain("Approximate summary");
 expect(renderToStaticMarkup(React.createElement(OperationsView, {...props, exact: true}))).not.toContain("Approximate summary");
 expect(buildOperationsHandoffPacket({summary, rows: [], exact: false}).exact).toBe(false);
});
