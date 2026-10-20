# M1.3 — Validation

Base `08d6905672b4660a7afbae0a0655415e203eafdb`, implementation head `17b794a3d16dd6dd315a544ac49d2ce2a6fe9ed5`. Node v24.13.1 on the developer laptop.

## `npm test` (actual output)

```
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

## `node --test test/store.test.mjs`

```

```

## Not checked

- Not run on the workshop guest. M1.1 (guest access) is still pending, so survival across a real `vc-app` restart and redeploy is unproven until M1.6. Reopening the store from the same directory stands in for a restart here.
- A failing disk write is handled (the in-memory change is rolled back and the error is rethrown), but no test covers it.
- No UI or HTTP is involved, so there is no browser check.
