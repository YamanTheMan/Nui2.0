"""Offline regression checks: python3 -m unittest discover -s tests -v."""
import contextlib
import copy
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sync_elevenlabs_knowledge as sync


class Reply:
    def __init__(self, body, status=200):
        self.body = body
        self.status_code = status
        self.ok = status == 200
        self.text = "PRIVATE provider diagnostic"

    def json(self):
        return self.body


def index(status, model=sync.RAG_EMBEDDING_MODEL):
    return {"id": "index-id", "model": model, "status": status}


class AgentLanguageIsolationTests(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "ELEVENLABS_AGENT_ID": "english-agent",
            "ELEVENLABS_AR_AGENT_ID": "arabic-agent",
        }

    def test_arabic_requires_distinct_explicit_id_and_never_falls_back(self):
        self.assertEqual(sync.resolve_agent_id(environ=self.environment), "english-agent")
        self.assertEqual(sync.resolve_agent_id("ar", self.environment), "arabic-agent")
        for environment, message in [
            ({"ELEVENLABS_AGENT_ID": "english-agent"}, "ELEVENLABS_AR_AGENT_ID"),
            ({"ELEVENLABS_AR_AGENT_ID": "arabic-agent"}, "isolation"),
            ({"ELEVENLABS_AGENT_ID": "shared", "ELEVENLABS_AR_AGENT_ID": "shared"}, "different IDs"),
        ]:
            with self.subTest(environment=environment):
                with self.assertRaisesRegex(RuntimeError, message):
                    sync.resolve_agent_id("ar", environment)
        with self.assertRaisesRegex(ValueError, "'en' or 'ar'"):
            sync.resolve_agent_id("fr", self.environment)

    def test_wrong_target_blocks_all_remote_reads_writes_and_uploads(self):
        with patch.dict(sync.os.environ, self.environment, clear=True), \
             patch.object(sync, "requests") as http, \
             patch.object(sync, "upload_document") as upload:
            for agent_id, language in [
                ("english-agent", "ar"), ("unconfigured-agent", "ar"), ("arabic-agent", "en"),
            ]:
                with self.subTest(agent_id=agent_id, language=language):
                    with self.assertRaises(RuntimeError):
                        sync.update_agent("test-key", agent_id, [], language)
                    with self.assertRaises(RuntimeError):
                        sync.sync_course_knowledge("test-key", agent_id, language)
                    with self.assertRaises(RuntimeError):
                        sync._enable_end_call("test-key", agent_id, language)
            self.assertEqual(http.mock_calls, [])
            upload.assert_not_called()

    def test_missing_arabic_id_blocks_before_uploads(self):
        with patch.dict(sync.os.environ, {"ELEVENLABS_AGENT_ID": "english-agent"}, clear=True), \
             patch.object(sync, "requests") as http, \
             patch.object(sync, "upload_document") as upload:
            with self.assertRaisesRegex(RuntimeError, "ELEVENLABS_AR_AGENT_ID"):
                sync.sync_course_knowledge("test-key", "english-agent", "ar")
            self.assertEqual(http.mock_calls, [])
            upload.assert_not_called()

    def test_builder_reuses_shared_knowledge_and_voice_without_changing_input(self):
        tts = {"model_id": "eleven_flash_v2", "voice_id": "existing-clone", "speed": 0.95, "stability": 0.65}
        knowledge = [{"type": "file", "id": "existing-doc", "name": "Course notes", "usage_mode": "auto"}]
        original = copy.deepcopy((tts, knowledge))
        english = sync.build_agent_payload(knowledge, tts)
        arabic = sync.build_agent_payload(knowledge, tts, "ar")
        self.assertEqual((tts, knowledge), original)
        self.assertEqual(english["conversation_config"]["tts"], tts)
        self.assertEqual(arabic["conversation_config"]["tts"], {**tts, "model_id": "eleven_v4"})
        for language, payload in [("en", english), ("ar", arabic)]:
            config = payload["conversation_config"]
            self.assertEqual(config["agent"]["language"], language)
            self.assertEqual(config["agent"]["first_message"], "")
            self.assertEqual(config["agent"]["prompt"]["knowledge_base"], knowledge)
            self.assertEqual(config["conversation"]["max_duration_seconds"], 7200)
            self.assertEqual(config["turn"]["silence_end_call_timeout"], -1)
        arabic["conversation_config"]["agent"]["prompt"]["knowledge_base"][0]["id"] = "modified-local-copy"
        self.assertEqual(knowledge[0]["id"], "existing-doc")
        self.assertEqual(english["conversation_config"]["agent"]["prompt"]["knowledge_base"][0]["id"], "existing-doc")

    def test_current_identity_overrides_legacy_branding_in_both_languages(self):
        for language, name in [("en", "Nui 2.0"), ("ar", "نُوي ٢٫٠")]:
            with self.subTest(language=language):
                prompt = sync._load_system_prompt(language)
                identity = prompt.split("WHO YOU ARE\n", 1)[1].split("\n\n", 1)[0]
                self.assertIn(name, identity.splitlines()[0])
                self.assertIn(
                    "AskProfNui is a former project name, never your current name or self-introduction.",
                    identity,
                )
                self.assertIn(
                    "Your current identity takes precedence over older names in retrieved course material.",
                    identity,
                )
                self.assertIn("If asked about AskProfNui, briefly clarify", identity)
                self.assertIn("now called " + name, identity)
                opener = sync._dynamic_variable_placeholders(language)["session_opening"]
                self.assertIn(name, opener)
                self.assertNotIn("askprofnui", opener.lower())

    def test_arabic_prompt_preserves_policies_but_localizes_speech_and_greeting(self):
        arabic = sync._load_system_prompt("ar")
        english = sync._load_system_prompt()
        self.assertIn("Modern Standard Arabic", arabic)
        self.assertNotIn("Always use contractions", arabic)
        self.assertNotIn('Write it as a single "Ha"', arabic)
        self.assertIn("Always use contractions", english)
        for section in ["GROUNDING AND UNCERTAINTY", "COURSE FACTS", "AI CLONE AND OFFICE HOURS — SEPTEMBER 16 UPDATE", "WHEN A STUDENT ASKS YOU TO CHANGE THEIR GRADE"]:
            expected = english.split(section + "\n", 1)[1].split("\n\n", 1)[0]
            if section == "WHEN A STUDENT ASKS YOU TO CHANGE THEIR GRADE":
                # Both agents retain the policy; only ownership of the counter differs.
                expected = expected.split("\nCount how many", 1)[0]
            self.assertIn(expected, arabic)
        self.assertIn("If the app sends you the attempt number,\ntrust that number", english)
        self.assertNotIn("trust that number", arabic)
        self.assertIn("English, or mixed Arabic-English. Changing language does not reset the count.", arabic)
        self.assertIn("never replace or reset your\ncount based on a client-supplied attempt number", arabic)
        self.assertIn("invoke end_call yourself", arabic)
        self.assertIn("source's original\nlanguage", arabic)
        opener = sync._dynamic_variable_placeholders("ar")["session_opening"]
        self.assertIn("مرحباً", opener)
        self.assertIn("الذكاء الاصطناعي", opener)
        self.assertNotIn("Hi", opener)

    def test_arabic_update_only_patches_arabic_agent_and_keeps_existing_voice(self):
        http = Mock()
        http.get.return_value = Reply({"conversation_config": {"tts": {"voice_id": "same-clone", "model_id": "eleven_v4", "speed": 1.0}}})
        http.patch.return_value = Reply({})
        with patch.dict(sync.os.environ, self.environment, clear=True), patch.object(sync, "requests", http):
            sync.update_agent("test-key", "arabic-agent", [], "ar")
        self.assertTrue(http.get.call_args.args[0].endswith("/arabic-agent"))
        self.assertTrue(http.patch.call_args.args[0].endswith("/arabic-agent"))
        payload = http.patch.call_args.kwargs["json"]["conversation_config"]
        self.assertEqual(payload["tts"], {"voice_id": "same-clone", "model_id": "eleven_v4", "speed": 1.0})
        self.assertEqual(payload["agent"]["language"], "ar")


class RagReadinessTests(unittest.TestCase):
    def setUp(self):
        self.clock = 0.0
        self.http = Mock()
        self.http.RequestException = ConnectionError
        self.http.post.side_effect = lambda _url, **kwargs: Reply({
            item["document_id"]: {"status": "success", "data": index("new")}
            for item in kwargs["json"]["items"]
        })
        self.http.get.return_value = Reply({"indexes": [index("succeeded")]})
        self.stack = contextlib.ExitStack()
        self.stack.enter_context(patch.object(sync, "requests", self.http))
        self.stack.enter_context(patch.object(sync.time, "monotonic", lambda: self.clock))
        self.stack.enter_context(patch.object(sync.time, "sleep", self.sleep))
        self.output = self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        self.addCleanup(self.stack.close)
        self.entries = [{"id": "doc-a", "name": "D01 Course overview", "type": "file"}]

    def sleep(self, seconds):
        self.clock += seconds

    def test_pending_to_succeeded_is_verified_with_matching_model(self):
        self.http.get.side_effect = [Reply({"indexes": [index("processing")]}), Reply({"indexes": [index("succeeded")]})]
        sync.ensure_rag_ready("test-key", self.entries, poll_interval=2)
        self.assertEqual(self.http.get.call_count, 2)
        self.assertEqual(self.clock, 2)
        sent = self.http.post.call_args.kwargs["json"]["items"][0]
        self.assertEqual(sent, {"document_id": "doc-a", "create_if_missing": True, "model": sync.RAG_EMBEDDING_MODEL})
        self.assertIn("all 1 documents verified", self.output.getvalue())

    def test_batch_success_is_not_readiness_and_existing_indexes_are_verified(self):
        self.http.post.return_value = Reply({"doc-a": {"status": "success", "data": index("succeeded")}})
        self.http.post.side_effect = None
        sync.ensure_rag_ready("test-key", self.entries)
        self.http.get.assert_called_once()
        self.assertEqual(self.clock, 0)

    def test_batches_respect_one_hundred_document_limit(self):
        entries = [{"id": f"doc-{i}", "name": f"Course document {i}"} for i in range(101)]
        sync.ensure_rag_ready("test-key", entries)
        self.assertEqual([len(call.kwargs["json"]["items"]) for call in self.http.post.call_args_list], [100, 1])
        self.assertEqual(self.http.get.call_count, 101)

    def test_batch_failure_or_missing_entry_stops_without_success_or_private_body(self):
        for body in [{}, {"doc-a": {"status": "failure", "message": "PRIVATE account info"}}]:
            with self.subTest(body=body):
                self.http.post.side_effect = None
                self.http.post.return_value = Reply(body)
                with self.assertRaisesRegex(RuntimeError, "D01 Course overview") as error:
                    sync.ensure_rag_ready("test-key", self.entries)
                self.assertNotIn("PRIVATE", str(error.exception))
        self.http.get.assert_not_called()
        self.assertNotIn("all 1 documents verified", self.output.getvalue())

    def test_terminal_and_unknown_states_never_allow_agent_update(self):
        for status in ["failed", "rag_limit_exceeded", "document_too_small", "cannot_index_folder", "unknown"]:
            with self.subTest(status=status):
                self.http.get.return_value = Reply({"indexes": [index(status)]})
                with self.assertRaisesRegex(RuntimeError, status):
                    sync.ensure_rag_ready("test-key", self.entries)
        self.assertNotIn("all 1 documents verified", self.output.getvalue())

    def test_empty_or_wrong_model_indexes_time_out_with_document_name(self):
        for indexes in [[], [index("succeeded", "another-model")], [index("processing")]]:
            with self.subTest(indexes=indexes):
                self.clock = 0
                self.http.get.return_value = Reply({"indexes": indexes})
                with self.assertRaisesRegex(RuntimeError, "timed out for: D01 Course overview"):
                    sync.ensure_rag_ready("test-key", self.entries, timeout_seconds=5, poll_interval=2)
                self.assertEqual(self.clock, 5)
        self.assertNotIn("all 1 documents verified", self.output.getvalue())

    def test_bad_http_json_and_network_errors_fail_safely(self):
        self.http.get.return_value = Reply({"detail": "PRIVATE"}, status=503)
        with self.assertRaisesRegex(RuntimeError, "D01 Course overview.*HTTP 503") as error:
            sync.ensure_rag_ready("test-key", self.entries)
        self.assertNotIn("PRIVATE", str(error.exception))
        self.http.get.return_value = Reply({"indexes": "not an array"})
        with self.assertRaisesRegex(RuntimeError, "Invalid RAG index list"):
            sync.ensure_rag_ready("test-key", self.entries)
        self.http.get.side_effect = ConnectionError("PRIVATE")
        with self.assertRaisesRegex(RuntimeError, "ConnectionError") as error:
            sync.ensure_rag_ready("test-key", self.entries)
        self.assertNotIn("PRIVATE", str(error.exception))

    def test_cached_uploads_are_checked_before_agent_update_and_failure_blocks_it(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "D01.txt"
            path.write_text("Course document contents", encoding="utf-8")
            manifest = {"documents": {path.name: {"id": "doc-a", "name": "D01 Course overview", "sha256": sync._file_hash(path)}}}
            order = []
            with patch.object(sync, "DOCUMENTS_DIR", Path(folder)), \
                 patch.object(sync, "_load_manifest", return_value=manifest), \
                 patch.object(sync, "_save_manifest"), \
                 patch.object(sync, "_load_system_prompt", return_value="valid prompt"), \
                 patch.object(sync, "upload_document") as upload, \
                 patch.object(sync, "update_agent", side_effect=lambda *_args: order.append("update")) as update, \
                 patch.object(sync, "_enable_end_call", side_effect=lambda *_args: order.append("end_call")):
                self.http.get.side_effect = lambda *_args, **_kwargs: (order.append("verified"), Reply({"indexes": [index("succeeded")]}))[1]
                self.assertEqual(sync.sync_course_knowledge("test-key", "test-agent"), [])
                self.assertEqual(order, ["verified", "update", "end_call"])
                upload.assert_not_called()
                update.reset_mock()
                self.http.get.side_effect = None
                self.http.get.return_value = Reply({"indexes": [index("failed")]})
                with self.assertRaisesRegex(RuntimeError, "failed"):
                    sync.sync_course_knowledge("test-key", "test-agent")
                update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
