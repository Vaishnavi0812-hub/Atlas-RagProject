import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import { BarChart3, FileStack, FlaskConical, MessagesSquare, Network, Scale } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { RedirectIfAuthed, RequireAuth } from "@/components/auth/Guards";
import { TenantProvider } from "@/context/TenantContext";
import { OverviewPage } from "@/pages/OverviewPage";
import { SystemPage } from "@/pages/SystemPage";
import { UpcomingPage } from "@/pages/UpcomingPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { InvitePage } from "@/pages/auth/InvitePage";
import { OnboardingPage } from "@/pages/auth/OnboardingPage";
import { SettingsLayout } from "@/pages/settings/SettingsLayout";
import { ProfileSettings } from "@/pages/settings/ProfileSettings";
import { OrganizationSettings } from "@/pages/settings/OrganizationSettings";
import { MembersSettings } from "@/pages/settings/MembersSettings";
import { WorkspacesSettings } from "@/pages/settings/WorkspacesSettings";
import { ActivitySettings } from "@/pages/settings/ActivitySettings";

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: "/register",
    element: (
      <RedirectIfAuthed>
        <RegisterPage />
      </RedirectIfAuthed>
    ),
  },
  { path: "/invite/:token", element: <InvitePage /> },
  {
    path: "/onboarding",
    element: (
      <RequireAuth allowNoOrg>
        <OnboardingPage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <TenantProvider>
          <AppShell />
        </TenantProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "system", element: <SystemPage /> },
      {
        path: "documents",
        element: (
          <UpcomingPage
            eyebrow="Workspace · Documents"
            title="Document library"
            description="Upload contracts, reports and policies. Each file is extracted, chunked, embedded and mapped into the knowledge graph."
            icon={FileStack}
            emptyTitle="No documents yet"
            emptyDescription="Once ingestion is live, uploaded PDF, DOCX, TXT and Markdown files will appear here with processing status, chunk counts and extracted entities."
            stage={3}
          />
        ),
      },
      {
        path: "graph",
        element: (
          <UpcomingPage
            eyebrow="Workspace · Knowledge Graph"
            title="Knowledge graph"
            description="Entities and relationships extracted from your documents, each traceable to the text that supports it."
            icon={Network}
            emptyTitle="The graph is empty"
            emptyDescription="Vendors, products, contracts and projects will appear here as connected nodes after documents are processed."
            stage={4}
          />
        ),
      },
      {
        path: "chat",
        element: (
          <UpcomingPage
            eyebrow="Workspace · Ask ATLAS"
            title="Ask ATLAS"
            description="Ask questions that span many documents. Choose Standard RAG, GraphRAG or Hybrid GraphRAG retrieval."
            icon={MessagesSquare}
            emptyTitle="No conversations yet"
            emptyDescription="Answers will cite their source documents and show the relationship paths used to reach them."
            stage={5}
          />
        ),
      },
      {
        path: "lab",
        element: (
          <UpcomingPage
            eyebrow="Intelligence · Comparison Lab"
            title="RAG vs GraphRAG"
            description="Run one question through all three retrieval strategies and compare answers, evidence, latency and cost side by side."
            icon={Scale}
            emptyTitle="No comparisons run"
            emptyDescription="Comparisons use the same workspace and documents for every mode, so differences reflect retrieval alone."
            stage={6}
          />
        ),
      },
      {
        path: "evaluation",
        element: (
          <UpcomingPage
            eyebrow="Intelligence · Evaluation"
            title="Evaluation & experiments"
            description="Build question datasets with expected answers and evidence, then measure retrieval and answer quality."
            icon={FlaskConical}
            emptyTitle="No datasets yet"
            emptyDescription="Precision@K, Recall@K, MRR, faithfulness and relevance will be computed from real evaluation runs."
            stage={6}
          />
        ),
      },
      {
        path: "analytics",
        element: (
          <UpcomingPage
            eyebrow="Intelligence · Analytics"
            title="Analytics"
            description="Usage, ingestion success, retrieval latency and token consumption, drawn from real records."
            icon={BarChart3}
            emptyTitle="Nothing to chart yet"
            emptyDescription="Metrics will populate as documents are processed and questions are asked."
            stage={7}
          />
        ),
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="profile" replace /> },
          { path: "profile", element: <ProfileSettings /> },
          { path: "organization", element: <OrganizationSettings /> },
          { path: "members", element: <MembersSettings /> },
          { path: "workspaces", element: <WorkspacesSettings /> },
          { path: "activity", element: <ActivitySettings /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
