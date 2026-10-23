---
'@openzeppelin/upgrades-core': patch
---

Fix incorrect slots for namespaced storage when a different struct with the same contract and struct name, from another source file, is also in the contract's storage layout.
