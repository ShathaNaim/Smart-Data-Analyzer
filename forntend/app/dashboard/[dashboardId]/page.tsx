import DashboardEditor from "./DashboardEditor";


export default async function DashboardPage({
  params,
}: {
  params: Promise<{ dashboardId: string }>;
}) {
  const { dashboardId } = await params;

  return <DashboardEditor dashboardId={dashboardId} />;
}
