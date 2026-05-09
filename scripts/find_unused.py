#!/usr/bin/env python3
"""Find potentially unused imports and private functions in the aiventra package.

This is a conservative, best-effort analyzer. It reports:
 - imports in each file that are not referenced anywhere in the package
 - private (leading underscore) functions not referenced anywhere in the package

It does NOT attempt to handle dynamic imports or uses via getattr, so review before applying changes.
"""

import ast
import json
import os
import sys

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
target_dir = os.path.join(repo_root, "aiventra")

py_files = []
for root, dirs, files in os.walk(target_dir):
    # skip __pycache__
    dirs[:] = [d for d in dirs if d != "__pycache__"]
    for f in files:
        if f.endswith('.py'):
            py_files.append(os.path.join(root, f))

all_used_names = set()
file_data = {}

for path in py_files:
    try:
        src = open(path, 'r', encoding='utf8').read()
    except Exception as e:
        print(f"WARN: Could not read {path}: {e}", file=sys.stderr)
        continue
    try:
        tree = ast.parse(src, path)
    except Exception as e:
        print(f"WARN: Could not parse {path}: {e}", file=sys.stderr)
        continue

    imports = set()
    private_defs = set()
    used = set()
    attrs = set()

    class V(ast.NodeVisitor):
        def visit_Import(self, node):
            for a in node.names:
                name = a.asname if a.asname else a.name.split('.')[0]
                imports.add(name)
            self.generic_visit(node)

        def visit_ImportFrom(self, node):
            for a in node.names:
                if a.name == '*':
                    continue
                name = a.asname if a.asname else a.name
                imports.add(name)
            self.generic_visit(node)

        def visit_Name(self, node):
            used.add(node.id)
            self.generic_visit(node)

        def visit_Attribute(self, node):
            # collect attribute name usage
            try:
                attrs.add(node.attr)
            finally:
                # also record the base name if it's a simple Name
                if isinstance(node.value, ast.Name):
                    used.add(node.value.id)
            self.generic_visit(node)

        def visit_FunctionDef(self, node):
            if node.name.startswith('_'):
                private_defs.add(node.name)
            self.generic_visit(node)

        def visit_ClassDef(self, node):
            self.generic_visit(node)

    V().visit(tree)

    file_data[path] = {
        'imports': sorted(imports),
        'private_defs': sorted(private_defs),
        'used_local': sorted(sorted(used | attrs)),
    }

    all_used_names.update(used)
    all_used_names.update(attrs)

# Now identify unused imports and private defs across package
report = {}
for path, data in file_data.items():
    imports = set(data['imports'])
    private_defs = set(data['private_defs'])
    unused_imports = sorted([i for i in imports if i not in all_used_names])
    unused_privates = sorted([p for p in private_defs if p not in all_used_names])
    if unused_imports or unused_privates:
        report[path] = {
            'unused_imports': unused_imports,
            'unused_private_functions': unused_privates,
            'used_local': data['used_local'],
        }

print(json.dumps({'root': target_dir, 'report': report}, indent=2))
