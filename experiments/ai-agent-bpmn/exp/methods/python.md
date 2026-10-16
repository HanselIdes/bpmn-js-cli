# Method: Python

Write a Python 3 program `build.py` in your run directory that generates the BPMN file.
Run it with `python3 build.py`. Every change to the BPMN goes through `build.py`: do not
hand-edit the generated XML. Use the standard library or packages already installed;
do not pip install anything. `build.py` may call c8ctl (for example `element-template apply`)
via subprocess. It must produce the BPMN diagram interchange (shapes and edges) itself.
