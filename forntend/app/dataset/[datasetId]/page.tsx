import DatasetWorkspace from "./DatasetWorkspace";


export default async function DatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  return <DatasetWorkspace datasetId={datasetId} />;
}
