Development Workflow
1. Choose an Issue
Browse GitHub Issues for open issues
Look for issues labeled good first issue if you're new to the project
Comment on the issue to claim it and ask questions if needed
Create a new issue if you've found a bug or have a feature request
2. Create a Branch
# Ensure your main branch is up to date
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
Branch Naming Convention:

feat/ - New features
fix/ - Bug fixes
docs/ - Documentation changes
refactor/ - Code refactoring
test/ - Test additions or changes
chore/ - Maintenance tasks
3. Make Your Changes
Write clear, focused commits
Follow the Conventional Commits specification
Add tests for new functionality
Update documentation as needed
Commit Message Format:

type(scope): subject

body

footer
Examples:

feat(delegations): add delegation creation form

Adds a form to create new agent delegations with spending limits.
Includes validation and submission to the delegations API.

Closes #123
fix(orders): correct status timeline sorting

Fixed the status timeline rendering out of order when multiple
events share the same timestamp.

Fixes #456
