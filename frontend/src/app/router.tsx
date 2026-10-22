import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { WorkflowsPage } from '../pages/WorkflowsPage';
import { WorkflowBuilderPage } from '../pages/WorkflowBuilderPage';
import { RunsPage } from '../pages/RunsPage';
import { RunDetailsPage } from '../pages/RunDetailsPage';
import { TriggersPage } from '../pages/TriggersPage';
import { WorkersPage } from '../pages/WorkersPage';
import { SettingsPage } from '../pages/SettingsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'workflows',
        element: <WorkflowsPage />,
      },
      {
        path: 'builder',
        element: <WorkflowBuilderPage />,
      },
      {
        path: 'builder/:workflowId',
        element: <WorkflowBuilderPage />,
      },
      {
        path: 'runs',
        element: <RunsPage />,
      },
      {
        path: 'runs/:runId',
        element: <RunDetailsPage />,
      },
      {
        path: 'triggers',
        element: <TriggersPage />,
      },
      {
        path: 'workers',
        element: <WorkersPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
