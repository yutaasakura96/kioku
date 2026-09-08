# Subject declarations

Language-neutral JSON, read by both toolchains (`03` §6, ADR 0003). It sits at
the root rather than under either side because it belongs to neither.

⚠️ One declaration across two toolchains is the third of `03` §16's three
hardest problems: the drift ADR 0003 was written to design out returns in a form
no compiler catches, and the answer is language-neutral data plus a
cross-language test.

Empty until [#3](https://github.com/yutaasakura96/kioku/issues/3).
