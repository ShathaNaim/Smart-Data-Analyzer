import DashboardEditor from "./DashboardEditor";
import AppSidebar from "../../components/AppSidebar";


export default async function DashboardPage({
  params,
}: {
  params: Promise<{ dashboardId: string }>;
}) {
  const { dashboardId } = await params;

  return (
    <div className="min-h-screen bg-amber-50 lg:flex">
      <AppSidebar />
      <div className="min-w-0 flex-1">
        <DashboardEditor dashboardId={dashboardId} />
      </div>
    </div>
  );
}
