"""
Pytest bootstrap. Runs before test collection (and therefore before `app` is
imported), so we can point MODEL_DIR at a throwaway directory — tests must
never write into the real models folder.

Its presence at the project root also puts this directory on sys.path, so the
tests can `import app`.
"""
import os
import tempfile

os.environ["MODEL_DIR"] = tempfile.mkdtemp(prefix="queueos-test-models-")
