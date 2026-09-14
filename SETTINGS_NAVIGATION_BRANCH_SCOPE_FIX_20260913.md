# Settings navigation + branch scope fix — 2026-09-13

Implemented from the approved Settings direction and latest user QA notes:

- Removed special/emphasized Queues treatment in the main sidebar.
- Moved Settings to the bottom sidebar area.
- Added Account beside Settings, with editable name/mobile profile view and sign out retained.
- Branches in Settings are expandable and show every accessible branch.
- Fixed stale content when switching from a non-branch Settings view back to a branch.
- Removed the Change Branch dropdown from branch content.
- Removed duplicate General/Services/etc. rows beneath the branch list; branch sections are now available only through the branch content tabs.
- Added Add branch directly below the expanded branch list.
- Added optional Duplicate settings from selected branch during branch creation. It copies services, operating hours, queue configuration, notification rules and appearance; users and terminals are not copied.
- Branch Services hides all branch selectors and only shows the selected branch.
- Branch Users hides branch selectors and only shows the selected branch.
- Branch Terminals hides branch selectors, only lists the selected branch terminals, and new/edit terminal forms are locked to the selected branch.
- Queue Settings, Notifications, Operating Hours and Appearance remain locked to the selected branch.
- Updated navigation/responsive E2E coverage for the new Account route and current Settings navigation model.
