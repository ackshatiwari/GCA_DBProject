from pydantic import BaseModel


class ManualSurveyPayload(BaseModel):
    site_id: int | None = None
    name: str
    weather: str
    date: str
    stream_width: float | None = None
    stream_depth: float | None = None
    flow_rate: float | None = None
    collection_time_1: int | None = None
    collection_time_2: int | None = None
    collection_time_3: int | None = None
    collection_time_4: int | None = None
    sampling_notes: str | None = None
    worms: int | None = None
    flatworms: int | None = None
    leeches: int | None = None
    crayfish: int | None = None
    sowbugs: int | None = None
    scuds: int | None = None
    stoneflies: int | None = None
    mayflies: int | None = None
    dragonflies: int | None = None
    damselflies: int | None = None
    hellgrammites: int | None = None
    fishflies: int | None = None
    alderflies: int | None = None
    common_netspinners: int | None = None
    most_caddisflies: int | None = None
    beetles: int | None = None
    midges: int | None = None
    blackflies: int | None = None
    most_true_flies: int | None = None
    gilled_snails: int | None = None
    lunged_snails: int | None = None
    clams: int | None = None
    metric_1: float | None = None
    metric_2: float | None = None
    metric_3: float | None = None
    metric_4: float | None = None
    metric_5: float | None = None
    metric_6: float | None = None
