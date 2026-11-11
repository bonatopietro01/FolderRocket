# Repository structure

Source layout after the functional grouping on 2026-11-11. App.tsx composes the UI; ChangeWorld.tsx remains a shared settings host. Runtime-path helpers remain at backend/services root. Entry points, public APIs and user-data locations are preserved.

```text
FolderRocket/
├── src/
│   ├── components/
│   │   ├── applications/       # Application files workspace
│   │   ├── auth/               # Session and account UI
│   │   ├── calendar/           # Calendar source
│   │   ├── daily-work/         # Agenda, notes and activity
│   │   ├── dashboard/          # Source layout and folder browser
│   │   ├── devices/            # USB and phone sources
│   │   ├── diagnostics/        # Diagnostic UI and client capture
│   │   ├── email-conversations/
│   │   ├── file-browser/       # Folder management and Tree Rocket
│   │   ├── file-studio/        # Conversion and document tools
│   │   ├── file-workflows/     # Cargo, drop zones and trash UI
│   │   ├── mail/               # Provider panels and alerts
│   │   ├── planet-knowledge/   # Graph, wiki and source selection
│   │   ├── search/
│   │   ├── settings/
│   │   ├── shared/             # Reusable icons, layout and helpers
│   │   └── sources/            # Recent files, capture and domain
│   ├── planets/                # Planet state, sync and styles
│   └── assets/
├── backend/
│   ├── services/
│   │   ├── analysis/
│   │   ├── auth/
│   │   ├── conversations/
│   │   ├── diagnostics/
│   │   ├── files/
│   │   ├── integrations/
│   │   ├── planet-knowledge/
│   │   └── shared/             # Account/token helpers
│   ├── ai/
│   ├── database/
│   └── test/
├── desktop/                    # Electron lifecycle and preload
├── browser-extension/
├── obsidian-plugin/
├── tests/                      # Regression tests and UI fixtures
├── docs/                       # Architecture, guides and plans
├── scripts/                    # Build and administration tools
│   └── legacy/                 # Explicit manual legacy utility
├── build/                      # Packaging assets
└── agent-kit/                  # Agent integration (runtime dotfolders also retained)
```

## Moves

| Before | After |
| --- | --- |
| `src/components/ProcessingWorkspace.tsx` | `src/components/file-studio/ProcessingWorkspace.tsx` |
| `src/components/ChangeFormatPanel.tsx` | `src/components/file-studio/ChangeFormatPanel.tsx` |
| `src/components/FolderManagement.tsx` | `src/components/file-browser/FolderManagement.tsx` |
| `src/components/TreeRocket.tsx` | `src/components/file-browser/TreeRocket.tsx` |
| `src/components/DashboardSourceBlock.tsx` | `src/components/dashboard/DashboardSourceBlock.tsx` |
| `src/components/DashboardSourceColumn.tsx` | `src/components/dashboard/DashboardSourceColumn.tsx` |
| `src/components/DashboardFolderBrowser.tsx` | `src/components/dashboard/DashboardFolderBrowser.tsx` |
| `src/components/GmailSourcePanel.tsx` | `src/components/mail/GmailSourcePanel.tsx` |
| `src/components/OutlookSourcePanel.tsx` | `src/components/mail/OutlookSourcePanel.tsx` |
| `src/components/TeamsSourcePanel.tsx` | `src/components/mail/TeamsSourcePanel.tsx` |
| `src/components/EmailAlertBuilder.tsx` | `src/components/mail/EmailAlertBuilder.tsx` |
| `src/emailAccounts.ts` | `src/components/mail/emailAccounts.ts` |
| `src/components/UsbSourcePanel.tsx` | `src/components/devices/UsbSourcePanel.tsx` |
| `src/components/PhoneSourcePanel.tsx` | `src/components/devices/PhoneSourcePanel.tsx` |
| `src/phoneFiles.ts` | `src/components/devices/phoneFiles.ts` |
| `src/usbFolders.ts` | `src/components/devices/usbFolders.ts` |
| `src/useUsbDrives.ts` | `src/components/devices/useUsbDrives.ts` |
| `src/components/SearchWorkspace.tsx` | `src/components/search/SearchWorkspace.tsx` |
| `src/components/SearchSourcePanel.tsx` | `src/components/search/SearchSourcePanel.tsx` |
| `src/components/DailyJob.tsx` | `src/components/daily-work/DailyJob.tsx` |
| `src/components/DailyAgendaRail.tsx` | `src/components/daily-work/DailyAgendaRail.tsx` |
| `src/components/StickyNotes.tsx` | `src/components/daily-work/StickyNotes.tsx` |
| `src/dailyActivity.ts` | `src/components/daily-work/dailyActivity.ts` |
| `src/components/DiagnosticsCenter.tsx` | `src/components/diagnostics/DiagnosticsCenter.tsx` |
| `src/components/DiagnosticsCenter.css` | `src/components/diagnostics/DiagnosticsCenter.css` |
| `src/diagnostics.ts` | `src/components/diagnostics/diagnostics.ts` |
| `src/components/IntegrationSetup.tsx` | `src/components/settings/IntegrationSetup.tsx` |
| `src/components/AdditionalFileIcons.tsx` | `src/components/shared/AdditionalFileIcons.tsx` |
| `src/components/FileKindIcon.tsx` | `src/components/shared/FileKindIcon.tsx` |
| `src/components/FolderScrollFrame.tsx` | `src/components/shared/FolderScrollFrame.tsx` |
| `src/components/FolderAppearanceStyles.tsx` | `src/components/shared/FolderAppearanceStyles.tsx` |
| `src/useFilePreview.ts` | `src/components/shared/useFilePreview.ts` |
| `src/browserBridge.ts` | `src/components/shared/browserBridge.ts` |
| `src/dragTypes.ts` | `src/components/shared/dragTypes.ts` |
| `src/components/CargoShip.tsx` | `src/components/file-workflows/CargoShip.tsx` |
| `src/components/FileDropZone.tsx` | `src/components/file-workflows/FileDropZone.tsx` |
| `src/components/FireMountain.tsx` | `src/components/file-workflows/FireMountain.tsx` |
| `src/components/ApplicationsWorkspace.tsx` | `src/components/applications/ApplicationsWorkspace.tsx` |
| `src/applicationFiles.ts` | `src/components/applications/applicationFiles.ts` |
| `src/components/DomainSourcePanel.tsx` | `src/components/sources/DomainSourcePanel.tsx` |
| `src/components/RecentFilesSourcePanel.tsx` | `src/components/sources/RecentFilesSourcePanel.tsx` |
| `src/components/ScreenCaptureSourcePanel.tsx` | `src/components/sources/ScreenCaptureSourcePanel.tsx` |
| `src/recentFileTypes.ts` | `src/components/sources/recentFileTypes.ts` |
| `src/components/GoogleCalendarSourcePanel.tsx` | `src/components/calendar/GoogleCalendarSourcePanel.tsx` |
| `src/components/AuthGate.tsx` | `src/components/auth/AuthGate.tsx` |
| `src/worlds.ts` | `src/planets/worlds.ts` |
| `src/worlds.css` | `src/planets/worlds.css` |
| `src/worldActivitySnapshot.ts` | `src/planets/worldActivitySnapshot.ts` |
| `src/obsidianSyncRetry.ts` | `src/planets/obsidianSyncRetry.ts` |
| `src/components/EmailConversations.tsx` | `src/components/email-conversations/EmailConversations.tsx` |
| `src/components/PlanetGraph.tsx` | `src/components/planet-knowledge/PlanetGraph.tsx` |
| `src/components/PlanetWiki.tsx` | `src/components/planet-knowledge/PlanetWiki.tsx` |
| `src/components/PlanetWikiRebuildControls.tsx` | `src/components/planet-knowledge/PlanetWikiRebuildControls.tsx` |
| `src/components/TeamsConversationsView.tsx` | `src/components/email-conversations/TeamsConversationsView.tsx` |
| `src/components/emailConversationGroups.ts` | `src/components/email-conversations/emailConversationGroups.ts` |
| `src/components/emailConversationScope.ts` | `src/components/email-conversations/emailConversationScope.ts` |
| `src/components/knowledgeCandidateSelection.ts` | `src/components/planet-knowledge/knowledgeCandidateSelection.ts` |
| `src/components/planetGraphLayout.ts` | `src/components/planet-knowledge/planetGraphLayout.ts` |
| `src/components/planetGraphQuery.ts` | `src/components/planet-knowledge/planetGraphQuery.ts` |
| `backend/services/providerAccountCatalog.js` | `backend/services/shared/providerAccountCatalog.js` |
| `backend/services/userPreferencesService.js` | `backend/services/auth/userPreferencesService.js` |
| `backend/services/treeRocketService.js` | `backend/services/files/treeRocketService.js` |
| `backend/services/deadlineService.js` | `backend/services/analysis/deadlineService.js` |
| `backend/services/emailTokenStore.js` | `backend/services/shared/emailTokenStore.js` |
| `backend/services/worldEmailAccountService.js` | `backend/services/conversations/worldEmailAccountService.js` |
| `backend/services/changeFormatService.js` | `backend/services/files/changeFormatService.js` |
| `backend/services/fileTypeInventoryService.js` | `backend/services/files/fileTypeInventoryService.js` |
| `backend/services/sentReplyGraphUpdate.js` | `backend/services/conversations/sentReplyGraphUpdate.js` |
| `backend/services/recentFilesService.js` | `backend/services/files/recentFilesService.js` |
| `backend/services/gmailAccountCatalog.js` | `backend/services/shared/gmailAccountCatalog.js` |
| `backend/services/emailAlertScheduler.js` | `backend/services/conversations/emailAlertScheduler.js` |
| `backend/services/planetGraphService.js` | `backend/services/planet-knowledge/planetGraphService.js` |
| `backend/services/searchService.js` | `backend/services/files/searchService.js` |
| `backend/services/gmailWarningService.js` | `backend/services/conversations/gmailWarningService.js` |
| `backend/services/archiveService.js` | `backend/services/files/archiveService.js` |
| `backend/services/teamsWarningService.js` | `backend/services/conversations/teamsWarningService.js` |
| `backend/services/userPathSecurity.js` | `backend/services/files/userPathSecurity.js` |
| `backend/services/planetKnowledgePipeline.js` | `backend/services/planet-knowledge/planetKnowledgePipeline.js` |
| `backend/services/projectionAnalysisService.js` | `backend/services/analysis/projectionAnalysisService.js` |
| `backend/services/emailAlertSettingsService.js` | `backend/services/conversations/emailAlertSettingsService.js` |
| `backend/services/emailConversationSelectionService.js` | `backend/services/conversations/emailConversationSelectionService.js` |
| `backend/services/planetKnowledgeService.js` | `backend/services/planet-knowledge/planetKnowledgeService.js` |
| `backend/services/canonicalPathContainment.js` | `backend/services/files/canonicalPathContainment.js` |
| `backend/services/applicationDiscoveryService.js` | `backend/services/files/applicationDiscoveryService.js` |
| `backend/services/diagnosticsService.js` | `backend/services/diagnostics/diagnosticsService.js` |
| `backend/services/hostFilesystem.js` | `backend/services/files/hostFilesystem.js` |
| `backend/services/outlookService.js` | `backend/services/integrations/outlookService.js` |
| `backend/services/trashService.js` | `backend/services/files/trashService.js` |
| `backend/services/planetWikiService.js` | `backend/services/planet-knowledge/planetWikiService.js` |
| `backend/services/gmailService.js` | `backend/services/integrations/gmailService.js` |
| `backend/services/googleCalendarService.js` | `backend/services/integrations/googleCalendarService.js` |
| `backend/services/localKnowledgeEngine.js` | `backend/services/planet-knowledge/localKnowledgeEngine.js` |
| `backend/services/knowledgeReadiness.js` | `backend/services/planet-knowledge/knowledgeReadiness.js` |
| `backend/services/auditLogService.js` | `backend/services/diagnostics/auditLogService.js` |
| `backend/services/conversationNotificationPolling.js` | `backend/services/conversations/conversationNotificationPolling.js` |
| `backend/services/obsidianVaultService.js` | `backend/services/planet-knowledge/obsidianVaultService.js` |
| `backend/services/applicationDiscoveryCache.js` | `backend/services/files/applicationDiscoveryCache.js` |
| `backend/services/docxFormatService.js` | `backend/services/files/docxFormatService.js` |
| `backend/services/selectedFolderWatcher.js` | `backend/services/files/selectedFolderWatcher.js` |
| `backend/services/conversationNotificationService.js` | `backend/services/conversations/conversationNotificationService.js` |
| `backend/services/localModelRuntime.js` | `backend/services/planet-knowledge/localModelRuntime.js` |
| `backend/services/obsidianVaultPaths.js` | `backend/services/planet-knowledge/obsidianVaultPaths.js` |
| `backend/services/fileBatchService.js` | `backend/services/files/fileBatchService.js` |
| `backend/services/worldActivityEmailService.js` | `backend/services/conversations/worldActivityEmailService.js` |
| `backend/services/desktopIntegrationConfigService.js` | `backend/services/integrations/desktopIntegrationConfigService.js` |
| `backend/services/stickyNoteAiService.js` | `backend/services/planet-knowledge/stickyNoteAiService.js` |
| `backend/services/browserBridgeService.js` | `backend/services/integrations/browserBridgeService.js` |
| `backend/services/userAuthService.js` | `backend/services/auth/userAuthService.js` |

## Cleanup

- Removed scripts/update-file-studio-layout.cjs: a one-off patch whose target markup is superseded.
- Removed five unused planet artwork variants: planet-black-hole.png, planet-galaxy.png, planet-blue-refined.png, planet-galaxy-refined.png and planet-saturn-refined.png. Source and test searches found no active consumers; current artwork imports use the inspired variants. Historical plan mentions are retained as history.
- Archived root index.js as scripts/legacy/move-input-output.mjs, preserving project input/output resolution. It is a manual file-moving utility, not an app entrypoint.
- Retained planet-knowledge/planetGraphQuery.ts and its tests: runtime inactivity alone does not establish that the capability should be removed.
- Retained the ignored alpha.12 ZIP and local generated/data folders. They are outside source cleanup.
- Historical plans and agent runtime configurations remain available; docs/README.md distinguishes current guides from historical plans.
