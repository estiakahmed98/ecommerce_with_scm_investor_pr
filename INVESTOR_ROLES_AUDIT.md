# Investor Roles & Permissions Audit

## Summary

Based on the "Investor Full and Final Test Flow" markdown and current `lib/rbac-config.ts`, here's what's implemented vs. what's needed.

---

## ✅ Roles Defined in rbac-config.ts

### 1. `investor_relations_manager`

- **Label**: Investor Relations Manager
- **Description**: Manage investor onboarding, KYC governance, capital ledger entries, and allocation setup

**Current Permissions:**

- ✅ `admin.panel.access`
- ✅ `dashboard.read`
- ✅ `reports.read`
- ✅ `investors.read`
- ✅ `investors.manage`
- ✅ `investor_documents.read`
- ✅ `investor_documents.manage`
- ✅ `investor_documents.review`
- ✅ `investor_profile_requests.read`
- ✅ `investor_profile_requests.review`
- ✅ `investor_ledger.read`
- ✅ `investor_ledger.manage`
- ✅ `investor_allocations.read`
- ✅ `investor_allocations.manage`
- ✅ `investor_profit.read`
- ✅ `investor_profit.manage`
- ✅ `investor_payout.read`
- ✅ `investor_statement.read`
- ✅ `profile.manage`

**Missing Permissions for Test Flow:**

- ❌ `investor_profit.approve` - Required for Step 10.5 (approve clean run)
- ❌ `investor_profit.post` - Required for Step 10.7 (post run)
- ❌ `investor_payout.approve` - Required for Step 12.2 (payout approver)
- ❌ `investor_payout.pay` - Required for Step 12.7 (mark paid)
- ❌ `investor_payout.void` - Required for Step 12.8 (void payout)

---

### 2. `investor_analyst`

- **Label**: Investor Analyst
- **Description**: Read-only investor performance, capital account, and allocation visibility role

**Current Permissions:**

- ✅ `admin.panel.access`
- ✅ `dashboard.read`
- ✅ `reports.read`
- ✅ `investors.read`
- ✅ `investor_documents.read`
- ✅ `investor_ledger.read`
- ✅ `investor_allocations.read`
- ✅ `investor_profit.read`
- ✅ `investor_payout.read`
- ✅ `investor_statement.read`
- ✅ `profile.manage`

**Status**: ✅ COMPLETE - All read-only permissions present as per markdown Step 8.3

---

### 3. `investor_portal`

- **Label**: Investor Portal User
- **Description**: External investor self-service role for portfolio, ledger, payouts, and statement visibility

**Current Permissions:**

- ✅ `investor.portal.access`
- ✅ `investor.portal.overview.read` - Dashboard metrics
- ✅ `investor.portal.ledger.read` - Ledger visibility
- ✅ `investor.portal.allocations.read` - Allocation visibility
- ✅ `investor.portal.profit.read` - Profit run visibility
- ✅ `investor.portal.payout.read` - Payout visibility
- ✅ `investor.portal.statement.read` - Statement visibility & export
- ✅ `investor.portal.documents.read` - Document center
- ✅ `investor.portal.documents.submit` - Document upload/resubmit
- ✅ `investor.portal.notifications.read` - Notifications
- ✅ `investor.portal.profile.read` - Profile view
- ✅ `investor.portal.profile.submit` - Profile update requests
- ✅ `profile.manage`

**Status**: ✅ COMPLETE - All portal permissions present as per markdown

---

### 4. `finance` (Additional)

- **Label**: Finance Manager
- **Description**: Finance and reporting focused role

**Current Permissions:**

- ✅ `investor_profit.approve`
- ✅ `investor_profit.post`
- ✅ `investor_payout.approve`
- ✅ `investor_payout.pay`
- ✅ `investor_payout.void`
- ✅ `investor_payout.manage`
- Plus finance/reporting permissions

**Status**: This role has the missing permissions, but they should also be on `investor_relations_manager`

---

## 🚨 Issues Found

### Issue #1: `investor_relations_manager` Missing Approval Permissions

The markdown test flow (Steps 10.5, 10.7, 12.2, 12.7, 12.8) expects the `investor_relations_manager` to:

- Approve profit runs
- Post approved profit runs
- Approve payouts
- Pay payouts
- Void payouts

**Current State**: These 5 permissions are NOT on `investor_relations_manager`

**Current Workaround**: The `finance` role has these, but the test flow doesn't mention a separate finance role

**Recommendation**: Add these 5 permissions to `investor_relations_manager` OR clarify test flow that separate "approver" or "finance" user is needed

---

## 📋 Missing/Unclear Roles

The markdown mentions:

### "Optional finance/admin user with investor_profit.approve, investor_profit.post, investor_payout.approve, investor_payout.pay, investor_payout.void"

This role **partially exists** as `finance`, but:

- It's not called out in the test flow as a primary role
- The test flow seems to expect `investor_relations_manager` to also do approvals
- Unclear if test should use `finance` user or extend `investor_relations_manager`

---

## 🔧 Required Changes

To fully support the markdown test flow, you need to either:

### Option A: Extend `investor_relations_manager` (Recommended)

Add these 5 permissions to `investor_relations_manager`:

```json
"investor_profit.approve",
"investor_profit.post",
"investor_payout.approve",
"investor_payout.pay",
"investor_payout.void"
```

### Option B: Separate Role for Approvals

Create a new role (e.g., `investor_approver` or `finance_investor`) and use it in the test flow instead

### Option C: Update Test Flow

Clarify that approval steps use a different role (e.g., `finance`) than the `investor_relations_manager`

---

## ✅ All Permissions Defined

All permissions mentioned in the markdown ARE defined in `SYSTEM_PERMISSIONS`:

- ✅ `investor_profit.approve`
- ✅ `investor_profit.post`
- ✅ `investor_payout.approve`
- ✅ `investor_payout.pay`
- ✅ `investor_payout.void`
- ✅ `investor_documents.review`
- ✅ `investors.manage`
- ✅ `users.manage`
- ✅ `investor_profit.manage`
- ✅ All portal permissions

**Issue**: Just not assigned to the right roles

---

## 📊 Coverage Matrix

| Permission                  | Needed For  | Currently On                 | Needs To Be On               |
| --------------------------- | ----------- | ---------------------------- | ---------------------------- |
| investor_profit.approve     | Step 10.5   | `finance`                    | `investor_relations_manager` |
| investor_profit.post        | Step 10.7   | `finance`                    | `investor_relations_manager` |
| investor_payout.approve     | Step 12.2   | `finance`                    | `investor_relations_manager` |
| investor_payout.pay         | Step 12.7   | `finance`                    | `investor_relations_manager` |
| investor_payout.void        | Step 12.8   | `finance`                    | `investor_relations_manager` |
| investor_documents.review   | Step 3.3    | `investor_relations_manager` | ✅ Already there             |
| investor_ledger.manage      | Step 8.1    | `investor_relations_manager` | ✅ Already there             |
| investor_allocations.manage | Step 9.1    | `investor_relations_manager` | ✅ Already there             |
| investor.portal.\*          | Sections 5+ | `investor_portal`            | ✅ Already there             |

---

## 🎯 Recommendation

**Add the 5 missing permissions to `investor_relations_manager` role** for a clean, single-manager workflow as the markdown test flow implies. This makes the most sense for an "Investor Relations Manager" who should handle the full lifecycle from creation through final payout.
