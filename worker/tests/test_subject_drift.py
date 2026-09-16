"""⚠️ The cross-language drift test of `03` §6.

`11` §7 names it: "The Python view of the *subject* declaration matches the JSON
file, and its field list matches TypeScript's. `03` §6 already specified this
test — it is the two-toolchain tax, and it is the one test that exists in both
suites by design."

TypeScript's half is `test/unit/subject-declaration.test.ts`, which checks that
its own view matches the file. This half checks the same for Python **and** asks
TypeScript what it thinks, by running `scripts/print-subject-view.ts` under
Node, which strips the types and executes it directly.

⚠️ **A drift a compiler cannot catch is caught by the thing that can.** Neither
`tsc` nor Python sees the other side; nothing but this test does.
"""

import json
import shutil
import subprocess

import pytest

from subject import (
    BLANK_CLASS,
    DECLARATION_PATH,
    REPO_ROOT,
    SOURCE_KINDS,
    SUBMITTABLE_SOURCE_KINDS,
    field_names,
    judgement_field_names,
    load_declaration,
    memory_bearing_field_names,
    pipeline_kinds,
    required_field_names,
    stage_keys,
)

VIEW_SCRIPT = "scripts/print-subject-view.ts"


@pytest.fixture(scope="module")
def typescript_view():
    """TypeScript's view, as TypeScript derives it.

    ⚠️ This fails rather than skips when Node is missing. A cross-language guard
    that quietly excuses itself on the machine where the two languages disagree
    is not a guard — and unlike ADR 0038's three container tests, Node is not
    optional in this repository: the app is a Nuxt app.
    """
    node = shutil.which("node")
    assert node is not None, "the drift test needs Node; this repository is a Nuxt app"

    completed = subprocess.run(
        [node, VIEW_SCRIPT],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, (
        f"{VIEW_SCRIPT} exited {completed.returncode}:\n{completed.stderr}"
    )
    return json.loads(completed.stdout)


class TestCrossLanguageDeclaration:
    def test_python_reads_the_same_file_typescript_imports(self, typescript_view):
        assert typescript_view["declaration_path"] == DECLARATION_PATH
        assert (REPO_ROOT / DECLARATION_PATH).is_file()

    def test_the_field_lists_agree(self, typescript_view):
        # The one `03` §6 names outright. Everything else here is the same
        # guard applied to the lists that would drift beside it.
        assert field_names(load_declaration()) == typescript_view["field_names"]

    def test_the_two_views_agree_on_every_derived_list(self, typescript_view):
        declaration = load_declaration()
        assert {
            "subject_id": declaration["subject_id"],
            "identity_key": declaration["identity_key"],
            "required_field_names": required_field_names(declaration),
            "judgement_field_names": judgement_field_names(declaration),
            "memory_bearing_field_names": memory_bearing_field_names(declaration),
            "pipeline_kinds": pipeline_kinds(declaration),
            "pipelines": {
                kind: stage_keys(declaration, kind) for kind in pipeline_kinds(declaration)
            },
            "template_keys": [template["key"] for template in declaration["templates"]],
        } == {
            "subject_id": typescript_view["subject_id"],
            "identity_key": typescript_view["identity_key"],
            "required_field_names": typescript_view["required_field_names"],
            "judgement_field_names": typescript_view["judgement_field_names"],
            "memory_bearing_field_names": typescript_view["memory_bearing_field_names"],
            "pipeline_kinds": typescript_view["pipeline_kinds"],
            "pipelines": typescript_view["pipelines"],
            "template_keys": typescript_view["template_keys"],
        }

    def test_every_stage_key_is_a_legal_python_module_name(self):
        # `03` §10: `worker/pipeline/` is one module per stage, **named by the
        # declaration**. A stage key that cannot be a module name breaks that
        # rule silently, in #8, months from here.
        declaration = load_declaration()
        for kind in pipeline_kinds(declaration):
            for key in stage_keys(declaration, kind):
                assert key.isidentifier(), key
                assert not key.startswith("_"), key
                assert key.islower(), key

    def test_the_two_agree_on_what_a_source_may_be_made_of(self, typescript_view):
        """⚠️ ADR 0063's `source.kind`, which is a cross-language constant with no
        compiler behind it — `04` §5.1's `CHECK` on one side and
        `shared/ingest/kind.ts` on the other. It is the same shape as the
        `kioku_job` channel, and it drifts the same way: silently.
        """
        assert list(SOURCE_KINDS) == typescript_view["source_kinds"]
        assert list(SUBMITTABLE_SOURCE_KINDS) == typescript_view["submittable_source_kinds"]

    def test_the_two_agree_on_what_is_blank(self, typescript_view):
        """⚠️ **The class now decides which lines of a *word list* are terms**, not
        only whether a generated field is empty. `shared/ingest/chunk.ts` counts
        the terms to place a *chunk* boundary and `worker/pipeline/normalise.py`
        reads them back out of that chunk; a character one language calls
        whitespace and the other calls content is a chunk holding 25 terms on one
        side of the repository and 24 on the other.

        The six characters the two languages' own definitions differ on are
        asserted by behaviour in both suites; this asserts that the *union* they
        were replaced with is one string rather than two.
        """
        assert BLANK_CLASS == typescript_view["blank_class"]
