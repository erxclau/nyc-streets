interface StreetProperties {
	OBJECTID: number;
	Street: string;
	FeatureTyp: string;
	Join_ID: string;
	StreetCode: number;
}

type AlternateNameColumn = 'OBJECTID' | 'PDir' | 'PType' | 'SName' | 'SType' | 'SDir' | 'Street' | 'Join_ID';
